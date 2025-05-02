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

  /** 1️⃣ Génération du tfvars pour la VM (toujours appelée) */
  async generateTerraformConfig(): Promise<void> {
    const infraDir    = path.join(process.cwd(), "prod-deployments", "infra", "google_cloud");
    const storageJson = await fs.readJson(path.join(infraDir, "storage.json")) as StorageInfraData;
    if (!storageJson.filestoreIp) {
      throw new Error("Impossible de lire filestoreIp depuis storage.json");
    }

    const { projectName }                       = this.cfg;
    const { region, zone, filestoreExportPath } = this.cfg.provider;

    const tfvars = {
      project_id            : projectName,
      region                : region,
      zone                  : zone,
      filestore_ip          : storageJson.filestoreIp,
      filestore_export_path : filestoreExportPath,
      // instance_name, machine_type, etc. dans variables.tf
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
        "--quiet",
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

  /** 3️⃣ Provisionne la VM + récupère l’adresse publique et le nom */
  async deployAndFetchData(): Promise<ComputeInfraData> {
    console.log(chalk.yellow("▶ Provisionnement Google Compute VM…"));
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
    console.log(chalk.green(`✓ VM prête : ${name} @ ${publicIp}`));

    return {
      provider     : "google",
      publicIp     : publicIp,
      sshUser      : "ubuntu",
      sshKeyPath   : path.join(process.env.HOME || "", ".ssh", "id_rsa"),
      instanceName : name
    };
  }
}
