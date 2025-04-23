import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import yaml from "js-yaml";
import chalk from "chalk";
import { IStorageService, StorageInfraData } from "../types.js";
import { AWSCliConfig, Provider } from "../../../config/cli-config.js";

export class AwsStorageService implements IStorageService {
  private readonly config: AWSCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;
  private readonly composeFile: string;

  constructor(config: AWSCliConfig) {
    if (config.provider.name !== Provider.AWS) {
      throw new Error("AwsStorageService ne supporte que AWS");
    }
    this.config = config;
    this.moduleDir = path.join(process.cwd(), "infra", "aws", "storage");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
    this.composeFile = path.join(process.cwd(), "docker-compose.prod.yml");
  }

  /**
   * 1️⃣ Génère terraform.tfvars.json pour AWS EFS
   */
  async generateTerraformConfig(): Promise<void> {
    const { region, subnetId, securityGroups } = this.config.provider;
    const tfvars = {
      region,
      efs_name: "efs-sandbox",
      subnet_id: subnetId,
      security_groups: securityGroups
    };
    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`→ tfvars générés pour Storage AWS: ${this.tfvarsPath}`));
  }

  /**
   * 2️⃣ Vérifie que l’EFS existe et est « available »
   */
  async checkInfra(): Promise<boolean> {
    const { region } = this.config.provider;
    if(!region) {
      console.error(chalk.red("⚠ Région AWS manquante dans la configuration."));
      return false;
    }
    if (spawnSync("aws", ["sts", "get-caller-identity"], { stdio: "ignore" }).status !== 0) {
      console.error(chalk.red("Échec de l'authentification AWS CLI."));
      return false;
    }
    try {
      const raw = spawnSync(
        "aws",
        ["efs", "describe-file-systems", "--region", region, "--creation-token", "efs-sandbox", "--output", "json"],
        { stdio: ["ignore", "pipe", "inherit"] }
      ).stdout!.toString();
      const fsInfo = JSON.parse(raw).FileSystems?.[0];
      if (!fsInfo || fsInfo.LifeCycleState !== "available") {
        console.warn(chalk.yellow(`⚠ EFS état: ${fsInfo?.LifeCycleState || "non trouvé"}`));
        return false;
      }
      console.log(chalk.green("✓ EFS disponible."));
      return true;
    } catch {
      console.warn(chalk.yellow("⚠ EFS non trouvé."));
      return false;
    }
  }

  /**
   * 3️⃣ Terraform init/apply + import si nécessaire + outputs
   */
  async deployAndFetchData(): Promise<StorageInfraData> {
    console.log(chalk.yellow("▶ Provisionnement AWS EFS…"));
    const cwd = this.moduleDir;

    // init
    let res = spawnSync("terraform", ["init"], { cwd, stdio: "inherit" });
    if (res.error) throw res.error;

    // apply avec capture stderr
    res = spawnSync("terraform", ["apply", "-auto-approve"], {
      cwd,
      stdio: ["inherit", "inherit", "pipe"]
    });
    if (res.status !== 0) {
      const stderr = res.stderr?.toString() || "";
      if (stderr.includes("already exists") || stderr.includes("creation token already used")) {
        console.log(chalk.yellow("⚠ EFS existe → import Terraform…"));
        const region = this.config.provider.region;
        if(!region) {
          console.error(chalk.red("⚠ Région AWS manquante dans la configuration."));
         throw new Error("Région AWS manquante dans la configuration.");
        }
        // récupère l’ID EFS
        const fsId = spawnSync(
          "aws",
          ["efs", "describe-file-systems", "--region", region, "--creation-token", "efs-sandbox", "--query", "FileSystems[0].FileSystemId", "--output", "text"],
          { stdio: ["ignore", "pipe", "inherit"] }
        ).stdout!.toString().trim();
        res = spawnSync("terraform", ["import", "aws_efs_file_system.efs", fsId], { cwd, stdio: "inherit" });
        if (res.status !== 0) throw new Error("✖ Import échoué");
        spawnSync("terraform", ["refresh"], { cwd, stdio: "inherit" });
        spawnSync("terraform", ["apply", "-auto-approve"], { cwd, stdio: "inherit" });
      } else {
        throw new Error("✖ Terraform apply échoué:\n" + stderr);
      }
    }

    // outputs
    const out = JSON.parse(
      spawnSync("terraform", ["output", "-json"], { cwd, stdio: ["ignore", "pipe", "inherit"] })
        .stdout!.toString()
    );
    const ip = out.efs_mount_target_ip.value as string;
    console.log(chalk.green(`✓ EFS mount target IP : ${ip}`));
    return { provider: "aws", efsMountTargetIp: ip };
  }

  /**
   * 4️⃣ Vérifie les driver_opts dans docker-compose.prod.yml
   */
  async checkComposeDrivers(infraData: StorageInfraData) {
    if (!infraData.efsMountTargetIp) throw new Error("IP du mount target EFS manquante");
    const content = await fs.readFile(this.composeFile, "utf8");
    const doc: any = yaml.load(content);
    const vols = doc.volumes || {};
    const expected = {
      type: "nfs",
      o: `addr=${infraData.efsMountTargetIp},${this.config.provider.mountOptions}`,
      device: `:${this.config.provider.filestoreExportPath}`
    };

    return Object.entries(vols)
      .map(([name, def]: [string, any]) => ({
        volumeName: name,
        currentDriverOpts: def.driver_opts || {},
        expectedDriverOpts: expected
      }))
      .filter(d =>
        d.currentDriverOpts.type !== expected.type ||
        d.currentDriverOpts.o !== expected.o ||
        d.currentDriverOpts.device !== expected.device
      );
  }

  /**
   * 5️⃣ Met à jour les driver_opts dans docker-compose.prod.yml
   */
  async fixComposeDrivers(infraData: StorageInfraData): Promise<void> {
    const content = await fs.readFile(this.composeFile, "utf8");
    const doc: any = yaml.load(content);
    const vols = doc.volumes || {};
    const expectedFull = {
      driver: "local",
      driver_opts: {
        type: "nfs",
        o: `addr=${infraData.efsMountTargetIp},${this.config.provider.mountOptions}`,
        device: `:${this.config.provider.filestoreExportPath}`
      }
    };

    let modified = false;
    for (const name of Object.keys(vols)) {
      const def = vols[name];
      const curOpts = def.driver_opts || {};
      if (
        def.driver !== expectedFull.driver ||
        curOpts.type !== expectedFull.driver_opts.type ||
        curOpts.o !== expectedFull.driver_opts.o ||
        curOpts.device !== expectedFull.driver_opts.device
      ) {
        doc.volumes[name] = expectedFull;
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(this.composeFile, yaml.dump(doc), "utf8");
      console.log(chalk.green("✓ docker-compose.prod.yml mis à jour pour les volumes AWS EFS."));
    } else {
      console.log(chalk.green("✓ Volumes déjà corrects dans docker-compose.prod.yml."));
    }
  }
  
  /** 6️⃣ Teste vraiment le montage NFS sur l’hôte (EFS). */
  async testMount(infraData: StorageInfraData): Promise<boolean> {
    const ip = infraData.efsMountTargetIp;
    if (!ip) throw new Error("IP du mount target EFS manquante");

    const testVol = `nfs_test_${Date.now()}`;
    spawnSync("docker", [
      "volume", "create", testVol,
      "--driver", "local",
      "--opt", "type=nfs",
      "--opt", `o=addr=${ip},${this.config.provider.mountOptions}`,
      "--opt", `device=:${this.config.provider.filestoreExportPath}`
    ], { stdio: "ignore" });

    const cmd = [
      "run", "--rm",
      "--mount", `source=${testVol},target=/mnt`,
      "alpine:latest", "sh", "-c",
      "echo ok > /mnt/__nfs_test__ && test -f /mnt/__nfs_test__"
    ];
    console.log(chalk.gray(`→ docker ${cmd.join(" ")}`));

    const result = spawnSync("docker", cmd, { shell: false, stdio: ["ignore","pipe","pipe"] });
    const out = result.stdout.toString().trim();
    const err = result.stderr.toString().trim();

    spawnSync("docker", ["volume", "rm", testVol], { stdio: "ignore" });

    if (result.status !== 0) {
      console.error(chalk.red("\n❌ Test de montage NFS en conteneur échoué."));
      if (out)  console.error(chalk.red("stdout:"), out);
      if (err)  console.error(chalk.red("stderr:"), err);
      console.error(chalk.red("→ Le conteneur Alpine n’a pas pu créer/lire le fichier sur /mnt."));
      return false;
    }

    console.log(chalk.green("✓ Montage NFS validé dans un conteneur Alpine."));
    return true;
  }
}