import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import prompts from "prompts";
import pkg from "pg";
import { IDbService, DBInfraData } from "../types.js";
import { AWSCliConfig, Provider } from "../../../config/cli-config.js";
import { loadEnvConfig } from "../../../utils/env-utils.js";
import { APP_DATABASE_INSTANCE_NAME } from "../google/google-db-service.js";

const { Client } = pkg;

export class AwsDbService implements IDbService {
  private readonly config: AWSCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;

  constructor(config: AWSCliConfig) {
    if (config.provider.name !== Provider.AWS) {
      throw new Error("AwsDbService ne supporte que AWS");
    }
    this.config = config;
    this.moduleDir = path.join(process.cwd(), "infra", "aws", "db");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
  }

  /**
   * 1️⃣ Génère terraform.tfvars.json pour AWS RDS
   */
  async generateTerraformConfig(): Promise<void> {
    const env = await loadEnvConfig();
    const { region, securityGroups } = this.config.provider;
    const tfvars = {
      region,
      sql_instance_name: env.POSTGRES_DB,
      sql_database_version: "15",
      sql_instance_class: "db.t3.micro",
      allocated_storage: 20,
      database_name: APP_DATABASE_INSTANCE_NAME,
      db_username: env.POSTGRES_USER,
      db_password: env.POSTGRES_PASSWORD,
      security_groups: securityGroups
    };
    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`→ tfvars générés pour DB AWS: ${this.tfvarsPath}`));
  }

  /**
   * 2️⃣ Vérifie que l’instance RDS existe et est “available”
   */
  async checkInfra(): Promise<boolean> {
    const { region } = this.config.provider;
    if(!region) {
      console.error(chalk.red("⚠ Région AWS manquante dans la configuration."));
      return false;
    }
    // Vérif AWS CLI
    if (spawnSync("aws", ["sts", "get-caller-identity"], { stdio: "ignore" }).status !== 0) {
      console.error(chalk.red("Échec de l'authentification AWS CLI."));
      return false;
    }
    // Descris l’instance
    const describe = spawnSync(
      "aws",
      [
        "rds", "describe-db-instances",
        "--db-instance-identifier", (await loadEnvConfig()).POSTGRES_DB,
        "--region", region,
        "--query", "DBInstances[0].DBInstanceStatus",
        "--output", "text"
      ],
      { stdio: ["ignore", "pipe", "inherit"] }
    );
    const status = describe.stdout!.toString().trim();
    if (status !== "available") {
      console.warn(chalk.yellow(`⚠ RDS état: ${status}`));
      return false;
    }
    console.log(chalk.green("✓ RDS disponible."));
    return true;
  }

  /**
   * 3️⃣ Terraform init/apply + import si déjà existant + outputs
   */
  async deployAndFetchData(): Promise<DBInfraData> {
    console.log(chalk.yellow("▶ Provisionnement AWS RDS…"));
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
      if (stderr.includes("already exists")) {
        console.log(chalk.yellow("⚠ RDS existe → import Terraform…"));
        const region = this.config.provider.region;
        if(!region) {
          console.error(chalk.red("⚠ Région AWS manquante dans la configuration."));
          throw new Error("Région AWS manquante dans la configuration.");
        }
        const arn = spawnSync(
          "aws",
          [
            "rds", "describe-db-instances",
            "--db-instance-identifier", (await loadEnvConfig()).POSTGRES_DB,
            "--region", region,
            "--query", "DBInstances[0].DBInstanceArn",
            "--output", "text"
          ],
          { stdio: ["ignore", "pipe", "inherit"] }
        ).stdout!.toString().trim();

        res = spawnSync("terraform", ["import", "aws_db_instance.db_instance", arn], { cwd, stdio: "inherit" });
        if (res.status !== 0) throw new Error("✖ Import Terraform échoué");
        spawnSync("terraform", ["refresh"], { cwd, stdio: "inherit" });
        spawnSync("terraform", ["apply", "-auto-approve"], { cwd, stdio: "inherit" });
      } else {
        throw new Error("✖ Terraform apply échoué:\n" + stderr);
      }
    }

    // récupère les outputs
    const out = JSON.parse(
      spawnSync("terraform", ["output", "-json"], { cwd, stdio: ["ignore", "pipe", "inherit"] })
        .stdout!.toString()
    );
    const endpoint = out.db_instance_endpoint.value as string;
    const port     = out.db_instance_port.value as number;
    console.log(chalk.green(`✓ RDS endpoint: ${endpoint}:${port}`));

    // mise à jour .env.prod
    const env2 = await loadEnvConfig();
    env2.DATABASE_URL = `postgresql://${env2.POSTGRES_USER}:${env2.POSTGRES_PASSWORD}@${endpoint}:${port}/${env2.POSTGRES_DB}`;
    await fs.writeFile(
      path.join(process.cwd(), ".env.prod"),
      Object.entries(env2).map(([k, v]) => `${k}=${v}`).join("\n")
    );
    console.log(chalk.green("→ .env.prod mis à jour avec DATABASE_URL AWS"));

    return { provider: "aws", endpoint, port };
  }

  /**
   * 3.bis️⃣ Récupère juste les outputs d’une infra AWS existante
   */
  async fetchInfraData(): Promise<DBInfraData> {
    const cwd = this.moduleDir;
    const raw = spawnSync("terraform", ["output", "-json"], {
      cwd,
      stdio: ["ignore", "pipe", "inherit"]
    });
    if (raw.status !== 0) {
      throw new Error("✖ Impossible de récupérer l’état Terraform RDS");
    }
    const out = JSON.parse(raw.stdout!.toString());
    return {
      provider: "aws",
      endpoint: out.db_instance_endpoint.value as string,
      port: out.db_instance_port.value as number
    };
  }

  /**
   * 4️⃣ Vérifie l’existence de l’utilisateur DB “appuser”
   */
  async checkUserExists(): Promise<boolean> {
    const env = await loadEnvConfig();
    const client = new Client({ connectionString: env.DATABASE_URL });
    try {
      await client.connect();
      const res = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname = $1",
        ["appuser"]
      );
      const exists = (res.rowCount ?? 0) > 0;
      console.log(
        exists
          ? chalk.green('✓ Utilisateur "appuser" existe.')
          : chalk.yellow('⚠ Utilisateur "appuser" absent.')
      );
      return exists;
    } finally {
      await client.end();
    }
  }

  /**
   * 5️⃣ Crée l’utilisateur DB “appuser” si besoin
   */
  async createUser(): Promise<void> {
    const { password } = await prompts({
      type: "password",
      name: "password",
      message: 'Mot de passe pour "appuser":'
    });
    if (!password) throw new Error("Mot de passe requis pour créer l'utilisateur DB");
    const env = await loadEnvConfig();
    const client = new Client({ connectionString: env.DATABASE_URL });
    try {
      await client.connect();
      await client.query("CREATE USER appuser WITH PASSWORD $1", [password]);
      console.log(chalk.green('✓ Utilisateur "appuser" créé.'));
    } finally {
      await client.end();
    }
  }
}
