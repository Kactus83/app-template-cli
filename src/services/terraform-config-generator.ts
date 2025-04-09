import fs from "fs-extra";
import * as path from "path";
import { CliConfig, Provider, InfraPerformance } from "../config/cli-config.js";
import { SecretManagerService } from "./secret-manager-service.js";

export async function generateTerraformVars(config: CliConfig): Promise<void> {
  let terraformVars: Record<string, any> = {};

  if (config.provider?.name === Provider.GOOGLE_CLOUD) {
    // Vérifier que la région et la zone sont renseignées pour Google Cloud
    if (!config.provider.region) {
      throw new Error("Pour Google Cloud, la région doit être renseignée dans la configuration CLI.");
    }
    if (!config.provider.zone) {
      throw new Error("Pour Google Cloud, la zone doit être renseignée dans la configuration CLI.");
    }
    // Adaptation du mapping des tiers pour PostgreSQL 16
    // On utilise ici :
    // - LOW    → "db-n1-standard-1"
    // - MEDIUM → "db-n1-standard-2"
    // - HIGH   → "db-n1-standard-4"
    let sqlTier: string;
    switch (config.provider.performance) {
      case InfraPerformance.MEDIUM:
        sqlTier = "db-n1-standard-2";
        break;
      case InfraPerformance.HIGH:
        sqlTier = "db-n1-standard-4";
        break;
      case InfraPerformance.LOW:
      default:
        sqlTier = "db-n1-standard-1";
        break;
    }
    terraformVars = {
      project_id: config.projectName,
      region: config.provider.region,
      zone: config.provider.zone,
      filestore_name: "app_filestore",
      filestore_capacity_gb: 128,
      sql_instance_name: "app-database",
      // On utilise POSTGRES_16 car c'est la version que vous utilisez en bac à sable entreprise
      sql_database_version: "POSTGRES_16",
      sql_tier: sqlTier,
      database_name: "app_database"
    };
    const tfvarsPath = path.join(process.cwd(), "infra", "google", "terraform.tfvars.json");
    await fs.writeFile(tfvarsPath, JSON.stringify(terraformVars, null, 2));
    console.log(`Fichier de variables Terraform généré : ${tfvarsPath}`);
  } else if (config.provider?.name === Provider.AWS) {
    // Pour AWS : récupération des secrets et vérification des paramètres obligatoires
    const dbSecrets = await SecretManagerService.getDbSecrets(process.cwd());
    if (!config.provider.subnetId || !config.provider.securityGroups) {
      throw new Error("Pour AWS, les champs subnetId et securityGroups doivent être renseignés dans la configuration CLI.");
    }
    terraformVars = {
      region: "us-east-1",
      efs_name: "efs-sandbox",
      database_name: "app_database",
      db_username: dbSecrets.POSTGRES_USER,
      db_password: dbSecrets.POSTGRES_PASSWORD,
      subnet_id: config.provider.subnetId,
      security_groups: config.provider.securityGroups
    };
    const tfvarsPath = path.join(process.cwd(), "infra", "aws", "terraform.tfvars.json");
    await fs.writeFile(tfvarsPath, JSON.stringify(terraformVars, null, 2));
    console.log(`Fichier de variables Terraform généré : ${tfvarsPath}`);
  }
}
