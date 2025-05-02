import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { AWSCliConfig, Provider } from "../../../config/cli-config.js";
import { IComputeService, ComputeInfraData, StorageInfraData } from "../types.js";

export class AwsComputeService implements IComputeService {
  private readonly cfg: AWSCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;

  constructor(cfg: AWSCliConfig) {
    if (cfg.provider.name !== Provider.AWS) {
      throw new Error("AwsComputeService ne supporte que AWS");
    }
    this.cfg        = cfg;
    this.moduleDir  = path.join(process.cwd(), "infra", "aws", "compute");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
  }

  /** 1️⃣ Génération du tfvars pour EC2 (toujours appelée) */
  async generateTerraformConfig(): Promise<void> {
    const infraDir    = path.join(process.cwd(), "prod-deployments", "infra", "aws");
    const storageJson = await fs.readJson(path.join(infraDir, "storage.json")) as StorageInfraData;
    if (!storageJson.efsMountTargetIp) {
      throw new Error("Impossible de lire efsMountTargetIp depuis storage.json");
    }

    const p = this.cfg.provider;
    const tfvars = {
      region                   : p.region,
      compute_key_name         : p.computeKeyName,
      compute_public_key_path  : p.computePublicKeyPath,
      subnet_id                : p.subnetId,
      security_groups          : p.securityGroups,
      efs_mount_target_ip      : storageJson.efsMountTargetIp,
      filestore_export_path    : p.filestoreExportPath,
      mount_point              : p.mountOptions.split(",")[0]  // ou votre logique de mount
    };

    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`✓ tfvars générés pour Compute AWS: ${this.tfvarsPath}`));
  }

  /** 2️⃣ Vérifie l’existence de l’instance EC2 (AWS CLI) */
  async checkInfra(): Promise<boolean> {
    const res = spawnSync(
      "aws",
      [
        "ec2", "describe-instances",
        "--filters", "Name=tag:Name,Values=app-vm",
        "--region", this.cfg.provider.region!,
        "--output", "text"
      ],
      { stdio: "ignore" }
    );
    const ok = res.status === 0;
    console.log(ok
      ? chalk.green("✓ Instance EC2 'app-vm' trouvée.")
      : chalk.yellow("⚠ Instance EC2 'app-vm' non trouvée.")
    );
    return ok;
  }

  /** 3️⃣ Provisionne EC2 + récupère l’IP publique et le nom */
  async deployAndFetchData(): Promise<ComputeInfraData> {
    console.log(chalk.yellow("▶ Provisionnement AWS EC2…"));
    const cwd = this.moduleDir;

    // ── Terraform init ── (non interactif)
    let res = spawnSync("terraform", ["init", "-input=false"], { cwd, stdio: "inherit" });
    if (res.status !== 0) throw new Error("Terraform init a échoué");

    // ── Terraform apply ── (non interactif, var-file)
    res = spawnSync("terraform", [
      "apply",
      "-auto-approve",
      "-input=false",
      `-var-file=${path.basename(this.tfvarsPath)}`
    ], { cwd, stdio: "inherit" });
    if (res.status !== 0) throw new Error("Terraform apply a échoué");

    // ── Lire les outputs ──
    const out = spawnSync("terraform", ["output", "-json"], {
      cwd, stdio: ["ignore","pipe","inherit"]
    }).stdout!.toString();
    const json     = JSON.parse(out);
    const publicIp = json.public_ip.value as string;
    const name     = json.instance_name.value as string;
    console.log(chalk.green(`✓ EC2 prête : ${name} @ ${publicIp}`));

    return {
      provider     : "aws",
      publicIp     : publicIp,
      sshUser      : "ec2-user",
      sshKeyPath   : this.cfg.provider.computePublicKeyPath,
      instanceName : name
    };
  }
}
