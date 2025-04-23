import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { AWSCliConfig, Provider } from "../../../config/cli-config.js";
import { IComputeService, ComputeInfraData, StorageInfraData } from "../types.js";

/**
 * Service de provisionnement de la VM sur AWS EC2.
 */
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

  /**
   * 1️⃣ Génération du tfvars pour EC2
   * Lit l’IP du mount target EFS depuis storage.json pour qu’on ne
   * perde pas l’automatisation et ne duplique pas la config.
   */
  async generateTerraformConfig(): Promise<void> {
    // on récupère l’IP du mount cible depuis storage.json
    const infraDir    = path.join(process.cwd(), "prod-deployments", "infra", "aws");
    const storageJson = (await fs.readJson(
      path.join(infraDir, "storage.json")
    )) as StorageInfraData;

    if (!storageJson.efsMountTargetIp) {
      throw new Error("Impossible de lire efsMountTargetIp depuis storage.json");
    }

    const p = this.cfg.provider;
    const tfvars = {
        region                 : p.region,
        compute_key_name       : p.computeKeyName,
        compute_public_key_path: p.computePublicKeyPath,
        subnet_id              : p.subnetId,
        security_groups        : p.securityGroups,
        efs_mount_target_ip : storageJson.efsMountTargetIp
    };

    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`✓ tfvars générés pour Compute AWS: ${this.tfvarsPath}`));
  }

  /** 2️⃣ Vérifie l’existence de l’instance EC2 via AWS CLI */
  async checkInfra(): Promise<boolean> {
    const res = spawnSync(
      "aws",
      [
        "ec2", "describe-instances",
        "--filters", "Name=tag:Name,Values=app-vm",
        "--region", this.cfg.provider.region || (() => { throw new Error("Region is undefined in AWS provider configuration"); })()
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

  /** 3️⃣ Provisionne EC2 + récupère l’IP publique */
  async deployAndFetchData(): Promise<ComputeInfraData> {
    console.log(chalk.yellow("▶ Provisionnement AWS EC2…"));
    for (const args of [["init"], ["apply", "-auto-approve"]]) {
      const res = spawnSync("terraform", args, {
        cwd: this.moduleDir,
        stdio: "inherit"
      });
      if (res.status !== 0) {
        throw new Error(`Terraform ${args[0]} a échoué`);
      }
    }

    // lit le output Terraform
    const out = spawnSync("terraform", ["output", "-json"], {
      cwd: this.moduleDir,
      stdio: ["ignore", "pipe", "inherit"]
    }).stdout!.toString();
    const json = JSON.parse(out);
    const ip   = json.public_ip.value as string;
    console.log(chalk.green(`✓ EC2 prête à ${ip}`));

    return {
      provider   : "aws",
      publicIp   : ip,
      sshUser    : "ec2-user",
      sshKeyPath : this.cfg.provider.computePublicKeyPath
    };
  }
}
