import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import yaml from "js-yaml";
import chalk from "chalk";
import { IStorageService, StorageInfraData } from "../types.js";
import { GoogleCliConfig, Provider } from "../../../config/cli-config.js";
import {
  verifyCredentials,
  autoLoginIfNeeded,
  verifyFilestore,
  enableSqlAdminApi,
} from "../../../utils/google-infra-utils.js";
import { autoFixNfsSupport } from "../../../utils/nfs-utils.js";

export class GoogleStorageService implements IStorageService {
  private readonly config: GoogleCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;
  private readonly composeFile: string;
  private readonly outputDir: string;

  constructor(config: GoogleCliConfig) {
    if (config.provider.name !== Provider.GOOGLE_CLOUD) {
      throw new Error("GoogleStorageService ne supporte que GOOGLE_CLOUD");
    }
    this.config = config;
    this.moduleDir = path.join(process.cwd(), "infra", "google", "storage");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
    this.composeFile = path.join(process.cwd(), "docker-compose.prod.yml");
    this.outputDir = path.join(process.cwd(), "prod-deployments", "infra", "google_cloud");
  }

  /**
   * 1️⃣ Génère le fichier terraform.tfvars.json
   */
  async generateTerraformConfig(): Promise<void> {
    const { projectName } = this.config;
    const { region, zone, filestoreExportPath, mountOptions } = this.config.provider;
    const tfvars = {
      project_id: projectName,
      region,
      zone,
      filestore_name: "app-filestore",
      filestore_capacity_gb: 1024,
      filestore_export_path: filestoreExportPath,
      mount_options: mountOptions,
    };
    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`✓ tfvars générés pour Storage GCP: ${this.tfvarsPath}`));
  }

  /**
   * 2️⃣ Vérifie que l’instance Filestore existe et est READY
   */
  async checkInfra(): Promise<boolean> {
    if (!(await verifyCredentials())) {
      await autoLoginIfNeeded();
    }
    const ok = await verifyFilestore(
      this.config.projectName,
      this.config.provider.zone,
      "app-filestore"
    );
    if (!ok) {
      console.warn(chalk.yellow("⚠ Filestore non trouvé ou non READY."));
    }
    return ok;
  }

  /**
   * 3️⃣ Terraform init/apply + import si nécessaire + récupération IP
   */
  async deployAndFetchData(): Promise<StorageInfraData> {
    console.log(chalk.yellow("▶ Provisionnement Google Filestore…"));
    const cwd = this.moduleDir;

    // init Terraform
    let res = spawnSync("terraform", ["init"], { cwd, stdio: "inherit" });
    if (res.error) throw res.error;

    // apply ou import
    res = spawnSync("terraform", ["apply", "-auto-approve"], {
      cwd,
      stdio: ["inherit", "inherit", "pipe"],
    });
    if (res.status !== 0) {
      const stderr = res.stderr?.toString() || "";
      if (stderr.includes("already exists")) {
        console.log(chalk.yellow("⚠ Instance existe → import Terraform…"));
        const resourceId =
          `projects/${this.config.projectName}` +
          `/locations/${this.config.provider.zone}/instances/app-filestore`;
        res = spawnSync("terraform", ["import", "google_filestore_instance.filestore", resourceId], { cwd, stdio: "inherit" });
        if (res.status !== 0) throw new Error("✖ Import Terraform échoué");
        spawnSync("terraform", ["refresh"], { cwd, stdio: "inherit" });
        res = spawnSync("terraform", ["apply", "-auto-approve"], { cwd, stdio: "inherit" });
        if (res.status !== 0) throw new Error("✖ Apply après import échoué");
      } else {
        throw new Error("✖ Terraform apply échoué:\n" + stderr);
      }
    }

    // outputs
    const out = JSON.parse(
      spawnSync("terraform", ["output", "-json"], { cwd, stdio: ["ignore", "pipe", "inherit"] })
        .stdout!.toString()
    );
    const ip = out.filestore_ip.value as string;
    console.log(chalk.green(`✓ Filestore prêt à ${ip}`));

    // persistance
    await fs.ensureDir(this.outputDir);
    const storageData: StorageInfraData = { provider: "google", filestoreIp: ip };
    await fs.writeFile(
      path.join(this.outputDir, "storage.json"),
      JSON.stringify(storageData, null, 2),
      "utf8"
    );
    console.log(chalk.green(`✓ Données stockage écrites dans ${path.relative(process.cwd(), this.outputDir)}/storage.json`));

    return storageData;
  }

  /**
   * 4️⃣ Vérifie les driver_opts dans docker-compose.prod.yml
   */
  async checkComposeDrivers(infraData: StorageInfraData) {
    const { filestoreIp } = infraData;
    if (!filestoreIp) throw new Error("IP Filestore manquante");
    const content = await fs.readFile(this.composeFile, "utf8");
    const doc: any = yaml.load(content);
    const vols = doc.volumes || {};
    const expected = {
      type: "nfs",
      o: `addr=${filestoreIp},${this.config.provider.mountOptions}`,
      device: `:${this.config.provider.filestoreExportPath}`,
    };

    return Object.entries(vols)
      .map(([name, def]: [string, any]) => ({
        volumeName: name,
        currentDriverOpts: def.driver_opts || {},
        expectedDriverOpts: expected,
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
        o: `addr=${infraData.filestoreIp},${this.config.provider.mountOptions}`,
        device: `:${this.config.provider.filestoreExportPath}`,
      },
    };

    let modified = false;
    for (const name of Object.keys(vols)) {
      const def = vols[name];
      const cur = def.driver_opts || {};
      if (
        def.driver !== expectedFull.driver ||
        cur.type !== expectedFull.driver_opts.type ||
        cur.o !== expectedFull.driver_opts.o ||
        cur.device !== expectedFull.driver_opts.device
      ) {
        doc.volumes[name] = expectedFull;
        modified = true;
      }
    }

    if (modified) {
      await fs.writeFile(this.composeFile, yaml.dump(doc), "utf8");
      console.log(chalk.green("✓ docker-compose.prod.yml mis à jour pour les volumes Google Filestore."));
    } else {
      console.log(chalk.green("✓ Volumes déjà corrects dans docker-compose.prod.yml."));
    }
  }

  /**
   * 6️⃣ Teste réellement le montage NFS dans un conteneur Alpine.
   *    Ne bloque plus le déploiement : renvoie true si OK, false sinon.
   */
  async testMount(infraData: StorageInfraData): Promise<boolean> {
    const { filestoreIp } = infraData;
    if (!filestoreIp) throw new Error("IP Filestore manquante");
  
    const testVol = `nfs_test_${Date.now()}`;
    // 1) Création du volume Docker de test
    spawnSync("docker", [
      "volume", "create", testVol,
      "--driver", "local",
      "--opt", "type=nfs",
      "--opt", `o=addr=${filestoreIp},${this.config.provider.mountOptions}`,
      "--opt", `device=:${this.config.provider.filestoreExportPath}`
    ], { stdio: "ignore" });
  
    // 2) Commande de test dans Alpine
    const cmd = [
      "run", "--rm",
      "--mount", `source=${testVol},target=/mnt`,
      "alpine:latest",
      "sh", "-c",
      "echo ok > /mnt/__nfs_test__ && test -f /mnt/__nfs_test__"
    ];
    console.log(chalk.gray(`→ docker ${cmd.join(" ")}`));
  
    const result = spawnSync("docker", cmd, { shell: false, stdio: ["ignore","pipe","pipe"] });
    const out = result.stdout.toString().trim();
    const err = result.stderr.toString().trim();
  
    // 3) Nettoyage
    spawnSync("docker", ["volume", "rm", testVol], { stdio: "ignore" });
  
    // 4) Verdict
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