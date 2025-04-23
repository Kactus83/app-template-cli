import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import { GoogleCliConfig, Provider } from "../../../config/cli-config.js";
import { IComputeService, ComputeInfraData, StorageInfraData } from "../types.js";

export class GoogleComputeService implements IComputeService {
  private readonly cfg: GoogleCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;

  constructor(cfg: GoogleCliConfig) {
    if (cfg.provider.name !== Provider.GOOGLE_CLOUD) {
      throw new Error("GoogleComputeService ne supporte que GOOGLE_CLOUD");
    }
    this.cfg        = cfg;
    this.moduleDir  = path.join(process.cwd(), "infra", "google", "compute");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
  }

  /** 1️⃣ Génération du tfvars pour la VM, en lisant l’IP du storage */
  async generateTerraformConfig(): Promise<void> {
    // lit le storage.json pour récupérer filestoreIp
    const infraDir     = path.join(process.cwd(), "prod-deployments", "infra", "google_cloud");
    const storageJson  = await fs.readJson(path.join(infraDir, "storage.json")) as StorageInfraData;
    if (!storageJson.filestoreIp) {
      throw new Error("Impossible de lire filestoreIp depuis storage.json");
    }

    const { projectName }               = this.cfg;
    const { region, zone, filestoreExportPath } = this.cfg.provider;

    const tfvars = {
      project_id            : projectName,
      region                : region,
      zone                  : zone,
      filestore_ip          : storageJson.filestoreIp,
      filestore_export_path : filestoreExportPath,
      // les autres variables (instance_name, machine_type…) sont dans variables.tf
    };

    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`✓ tfvars générés pour Compute GCP: ${this.tfvarsPath}`));
  }

  /** 2️⃣ Vérifie l’existence de la VM (via gcloud CLI) */
  async checkInfra(): Promise<boolean> {
    const name = "app-vm";
    const zone = this.cfg.provider.zone;
    const res = spawnSync(
      "gcloud",
      [
        "compute", "instances", "describe", name,
        `--project=${this.cfg.projectName}`,
        `--zone=${zone}`,
        "--format=json"
      ],
      { stdio: "ignore" }
    );
    const ok = res.status === 0;
    console.log(ok
      ? chalk.green(`✓ VM "${name}" existe en ${zone}.`)
      : chalk.yellow(`⚠ VM "${name}" non trouvée.`)
    );
    return ok;
  }

  /** 3️⃣ Provisionne la VM + récupère l'adresse publique */
  async deployAndFetchData(): Promise<ComputeInfraData> {
    console.log(chalk.yellow("▶ Provisionnement Google Compute VM…"));
    // terraform init & apply
    for (const args of [["init"], ["apply", "-auto-approve"]]) {
      const res = spawnSync("terraform", args, { cwd: this.moduleDir, stdio: "inherit" });
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
    console.log(chalk.green(`✓ VM prête à ${ip}`));

    return {
      provider   : "google",
      publicIp   : ip,
      sshUser    : "ubuntu",
      sshKeyPath : path.join(process.env.HOME || "", ".ssh", "id_rsa")
    };
  }
}
