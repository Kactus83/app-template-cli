import { spawnSync } from "child_process";
import path from "path";
import fs from "fs-extra";
import chalk from "chalk";
import prompts from "prompts";
import { IDbService, DBInfraData } from "../types.js";
import { GoogleCliConfig, InfraPerformance, Provider } from "../../../config/cli-config.js";
import {
  verifyCredentials,
  autoLoginIfNeeded,
  verifyDatabase,
  enableSqlAdminApi,
} from "../../../utils/google-infra-utils.js";
import { loadEnvConfig, writeEnv } from "../../../utils/env-utils.js";

export const APP_DATABASE_INSTANCE_NAME = 'app_database';

export class GoogleDbService implements IDbService {
  private readonly config: GoogleCliConfig;
  private readonly moduleDir: string;
  private readonly tfvarsPath: string;

  constructor(config: GoogleCliConfig) {
    if (config.provider.name !== Provider.GOOGLE_CLOUD) {
      throw new Error("GoogleDbService ne supporte que GOOGLE_CLOUD");
    }
    this.config = config;
    this.moduleDir = path.join(process.cwd(), "infra", "google", "db");
    this.tfvarsPath = path.join(this.moduleDir, "terraform.tfvars.json");
  }

  /**
   * 1️⃣ Génère le fichier terraform.tfvars.json pour Cloud SQL
   */
  async generateTerraformConfig(): Promise<void> {
    console.log(chalk.magenta("\n──────── 1️⃣ Génération tfvars Cloud SQL ────────"));
    const { confirm } = await prompts({
      type: "confirm",
      name: "confirm",
      message: "Générer le fichier terraform.tfvars.json pour Cloud SQL ?",
      initial: true,
    });
    if (!confirm) {
      console.log(chalk.red("✖ Génération tfvars annulée."));
      return;
    }

    const env = await loadEnvConfig();
    const { projectName } = this.config;
    const { region, performance } = this.config.provider;
    let sqlDatabaseVersion: string;
    let sqlTier: string;

    switch (performance) {
      case InfraPerformance.LOW:
        sqlDatabaseVersion = "POSTGRES_15";
        sqlTier = "db-f1-micro";
        break;
      case InfraPerformance.MEDIUM:
        sqlDatabaseVersion = "POSTGRES_16";
        sqlTier = "db-n1-standard-1";
        break;
      case InfraPerformance.HIGH:
        sqlDatabaseVersion = "POSTGRES_16";
        sqlTier = "db-n1-standard-2";
        break;
      default:
        sqlDatabaseVersion = "POSTGRES_16";
        sqlTier = "db-n1-standard-1";
    }

    const tfvars = {
      project_id: projectName,
      region,
      sql_instance_name: env.POSTGRES_DB,
      sql_database_version: sqlDatabaseVersion,
      sql_tier: sqlTier,
      database_name: APP_DATABASE_INSTANCE_NAME,
    };

    await fs.ensureDir(this.moduleDir);
    await fs.writeFile(this.tfvarsPath, JSON.stringify(tfvars, null, 2), "utf8");
    console.log(chalk.green(`✓ tfvars générés: ${this.tfvarsPath}`));
  }

  /**
   * 2️⃣ Vérifie la connectivité à la DB (gcloud + pg)
   */
  async checkInfra(): Promise<boolean> {
    console.log(chalk.magenta("\n──────── 2️⃣ Vérification connectivité Cloud SQL ────────"));
    if (!(await verifyCredentials())) {
      console.log(chalk.yellow("→ Authentification Google invalide, lancement du login…"));
      await autoLoginIfNeeded();
    }

    try {
      const ok = await verifyDatabase();
      if (ok) {
        console.log(chalk.green("✓ Base de données accessible."));
        return true;
      } else {
        console.log(chalk.yellow("⚠ Connexion refusée, instance non prête ou indisponible."));
        return false;
      }
    } catch (err: any) {
      console.error(chalk.red("✖ Erreur vérification Cloud SQL :"), err.message);
      console.log(
        chalk.red(
          `→ Activez l'API Cloud SQL Admin : gcloud services enable sqladmin.googleapis.com --project=${this.config.projectName}`
        )
      );
      console.log(chalk.red("→ Vérifiez vos rôles IAM (SQL Admin) dans la console GCP."));
      return false;
    }
  }

  /**
   * 3️⃣ Provisionnement Terraform + import si nécessaire
   */
  async deployAndFetchData(): Promise<DBInfraData> {
    console.log(chalk.magenta("\n──────── 3️⃣ Provisionnement Cloud SQL ────────"));

    const { confirm: cInit } = await prompts({
      type: "confirm",
      name: "confirm",
      message: "Exécuter 'terraform init' ?",
      initial: true,
    });
    if (!cInit) throw new Error("✖ init Terraform annulée.");

    let res = spawnSync("terraform", ["init"], { cwd: this.moduleDir, stdio: "inherit" });
    if (res.error) throw res.error;

    const { confirm: cApply } = await prompts({
      type: "confirm",
      name: "confirm",
      message: "Exécuter 'terraform apply -auto-approve' ?",
      initial: true,
    });
    if (!cApply) throw new Error("✖ apply Terraform annulée.");

    res = spawnSync("terraform", ["apply", "-auto-approve"], {
      cwd: this.moduleDir,
      stdio: ["inherit", "inherit", "pipe"],
    });

    if (res.status !== 0) {
      const stderr = res.stderr?.toString() || "";
      if (stderr.includes("instanceAlreadyExists")) {
        console.log(chalk.yellow("\n→ Instance existante détectée, import Terraform…"));
        await this.importExistingInstance();
      } else {
        throw new Error(`✖ Terraform apply échoué :\n${stderr}`);
      }
    }

    console.log(chalk.magenta("\n──────── Récupération outputs Terraform ────────"));
    const rawOut = spawnSync("terraform", ["output", "-json"], {
      cwd: this.moduleDir,
      stdio: ["ignore", "pipe", "inherit"],
    });
    if (rawOut.error || rawOut.status !== 0) throw rawOut.error || new Error("Échec outputs Terraform");
    const out = JSON.parse(rawOut.stdout!.toString());
    const conn = out.cloud_sql_connection_name.value as string;
    const ip = out.cloud_sql_public_ip.value as string;
    console.log(chalk.green(`✓ Cloud SQL prêt : ${conn} @ ${ip}`));

    console.log(chalk.magenta("\n──────── Mise à jour .env.prod ────────"));
    const env2 = await loadEnvConfig();
    env2.DATABASE_URL =
      `postgresql://${env2.POSTGRES_USER}:${env2.POSTGRES_PASSWORD}@${ip}:5432/${env2.POSTGRES_DB}`;
    await writeEnv(env2);
    console.log(chalk.green("✓ .env.prod mis à jour avec DATABASE_URL"));

    return { provider: "google", connectionName: conn, publicIp: ip };
  }

  private async importExistingInstance(): Promise<void> {
    const instId = `${this.config.projectName}:${this.config.provider.region}:${APP_DATABASE_INSTANCE_NAME}`;

    const { confirm: cImportInst } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Importer l’instance "${instId}" dans Terraform ?`,
      initial: true,
    });
    if (!cImportInst) throw new Error("✖ Import instance annulé.");

    let res = spawnSync("terraform", [
      "import",
      "google_sql_database_instance.db_instance",
      `projects/${instId}`,
    ], { cwd: this.moduleDir, stdio: "inherit" });
    if (res.status !== 0) throw new Error("✖ Import Terraform (instance) échoué");

    const env = await loadEnvConfig();
    const dbId = `projects/${instId}/databases/${env.POSTGRES_DB}`;
    const { confirm: cImportDb } = await prompts({
      type: "confirm",
      name: "confirm",
      message: `Importer la base "${env.POSTGRES_DB}" ?`,
      initial: true,
    });
    if (!cImportDb) throw new Error("✖ Import database annulé.");

    res = spawnSync("terraform", [
      "import",
      "google_sql_database.default_db",
      dbId,
    ], { cwd: this.moduleDir, stdio: "inherit" });
    if (res.status !== 0) throw new Error("✖ Import Terraform (database) échoué");

    console.log(chalk.yellow("→ Rafraîchir et re-apply Terraform…"));
    spawnSync("terraform", ["refresh"], { cwd: this.moduleDir, stdio: "inherit" });
    res = spawnSync("terraform", ["apply", "-auto-approve"], { cwd: this.moduleDir, stdio: "inherit" });
    if (res.status !== 0) throw new Error("✖ Apply après import échoué");
  }

  /**
   * 3.bis️⃣ Récupère les outputs d’une infra GCP existante
   **/
  async fetchInfraData(): Promise<DBInfraData> {
    console.log(chalk.magenta("\n──────── 3.bis️⃣ Récupération infra existante ────────"));
    const raw = spawnSync("terraform", ["output", "-json"], { cwd: this.moduleDir, stdio: ["ignore", "pipe", "inherit"] });
    if (raw.error || raw.status !== 0) throw new Error("✖ Impossible de récupérer l’état Terraform Cloud SQL");
    const out = JSON.parse(raw.stdout!.toString());
    console.log(chalk.green("✓ Outputs récupérés"));
    return {
      provider: "google",
      connectionName: out.cloud_sql_connection_name.value as string,
      publicIp: out.cloud_sql_public_ip.value as string,
    };
  }

  /**
   * 4️⃣ Vérifie l’existence de l’utilisateur DB (prompt + vérif)
   **/
  async checkUserExists(infra: DBInfraData): Promise<boolean> {
    console.log(chalk.magenta("\n──────── 4️⃣ Vérification de l'utilisateur DB ────────"));
    console.log(chalk.gray(`→ Instance cible (full) : ${infra.connectionName}`));

    if (!infra.connectionName) {
      console.error(chalk.red("✖ Instance DB introuvable."));
      throw new Error("Données d'infra invalides : connectionName manquant.");
    }

    // Extraire le nom simple d'instance
    const instanceId = infra.connectionName.split(":").pop()!;
    console.log(chalk.blue(`→ Utilisation de l'ID d'instance Cloud SQL : ${instanceId}`));

    // 1) Chargement des credentials existants
    const env = await loadEnvConfig();
    let username = env.APP_DB_USER;
    let password = env.APP_DB_PASSWORD;

    if (username && password) {
      console.log(chalk.yellow(`⚠ Credentials existants dans .env.prod : utilisateur '${username}'.`));
      const { reuse } = await prompts({
        type: 'confirm',
        name: 'reuse',
        message: `Réutiliser ces credentials pour vérifier l'utilisateur DB ?`,
        initial: true,
      });
      if (!reuse) {
        const creds = await prompts([
          { type: "text", name: "username", message: "Nom d'utilisateur DB :", initial: username },
          { type: "password", name: "password", message: "Mot de passe DB :" },
        ]);
        username = creds.username;
        password = creds.password;
        env.APP_DB_USER = username;
        env.APP_DB_PASSWORD = password;
        await writeEnv(env);
        console.log(chalk.green("✓ Credentials mis à jour dans .env.prod."));
      } else {
        console.log(chalk.green("✓ Réutilisation des credentials existants."));
      }
    } else {
      console.log(chalk.yellow("⚠ Aucuns credentials DB trouvés dans .env.prod."));
      const creds = await prompts([
        { type: "text", name: "username", message: "Nom d'utilisateur DB :", initial: "appuser" },
        { type: "password", name: "password", message: "Mot de passe DB :" },
      ]);
      username = creds.username;
      password = creds.password;
      env.APP_DB_USER = username;
      env.APP_DB_PASSWORD = password;
      await writeEnv(env);
      console.log(chalk.green("✓ Credentials ajoutés dans .env.prod."));
    }

    // Rechargement
    const envReloaded = await loadEnvConfig();
    username = envReloaded.APP_DB_USER!;
    password = envReloaded.APP_DB_PASSWORD!;

    // 2) Test de connexion SQL direct
    console.log(chalk.yellow("→ Tentative connexion SQL direct…"));
    try {
      const pgmod = await import("pg");
      const Client = pgmod.Client ?? pgmod.default?.Client;
      if (!Client) throw new Error("pg.Client introuvable");
      const client = new Client({ connectionString: envReloaded.DATABASE_URL! });
      await client.connect();
      const res = await client.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [username]);
      await client.end();
      if ((res.rowCount ?? 0) > 0) {
        console.log(chalk.green(`✓ Utilisateur '${username}' existe en base.`));
        return true;
      }
      console.log(chalk.yellow(`⚠ Utilisateur '${username}' absent en base.`));
      return false;
    } catch (e: any) {
      if (e.code === "28P01" || e.message.includes("authentication failed")) {
        console.log(chalk.yellow(`⚠ Authentification échouée (28P01), utilisateur '${username}' absent.`));
        return false;
      }
      console.log(chalk.red(`✖ Échec connexion SQL direct : ${e.message}`));
      console.log(chalk.red("→ Vérifiez DATABASE_URL et la connectivité réseau."));
    }

    // 3) Test via gcloud CLI
    console.log(chalk.yellow("→ Tentative via gcloud CLI…"));
    const g = spawnSync("gcloud", [
      "sql", "users", "list",
      `--instance=${instanceId}`,
      "--format=json",
      `--project=${this.config.projectName}`
    ], { shell: true, stdio: ["pipe","pipe","pipe"] });
    if (g.error) {
      console.error(chalk.red(`✖ gcloud non trouvé : ${g.error.message}`));
      console.log(chalk.red("→ Installez Google Cloud SDK : https://cloud.google.com/sdk/docs/install"));
      return false;
    } else if (g.status !== 0) {
      const stderr = g.stderr?.toString() ?? "";
      console.error(chalk.red(`✖ gcloud retourné code ${g.status} : ${stderr}`));
      console.log(chalk.red("→ Vérifiez que l’API SQL Admin est activée :"));
      console.log(chalk.cyan(`  gcloud services list --enabled --filter=sqladmin.googleapis.com --project=${this.config.projectName}`));
      return false;
    } else {
      try {
        const users = JSON.parse(g.stdout!.toString());
        if (Array.isArray(users) && users.some((u: any) => u.name === username)) {
          console.log(chalk.green(`✓ Utilisateur '${username}' trouvé via gcloud.`));
          return true;
        }
        console.log(chalk.yellow(`⚠ Utilisateur '${username}' non listé via gcloud.`));
        return false;
      } catch (e: any) {
        console.log(chalk.red(`✖ Erreur parsing JSON gcloud : ${e.message}`));
        return false;
      }
    }
  }

  /**
   * 5️⃣ Création de l’utilisateur DB si nécessaire
   **/
  async createUser(infra: DBInfraData): Promise<void> {
    console.log(chalk.magenta("\n──────── 5️⃣ Création de l'utilisateur DB ────────"));

    if(!infra.connectionName) {
      console.error(chalk.red("✖ Instance DB introuvable."));
      throw new Error("Données d'infra invalides : connectionName manquant.");
    }
    console.log(chalk.gray(`→ Instance cible (full) : ${infra.connectionName}`));

    // Extraire le nom simple d'instance
    const instanceId = infra.connectionName.split(":").pop()!;

    // 1) Vérifier gcloud
    if (spawnSync("gcloud", ["--version"], { shell: true, stdio: "ignore" }).status !== 0) {
      console.error(chalk.red("✖ gcloud non trouvé dans votre PATH."));
      console.log(chalk.red("→ Installez Google Cloud SDK : https://cloud.google.com/sdk/docs/install"));
      throw new Error("gcloud requis pour la création de l’utilisateur DB");
    }

    // 2) Récupérer creds admin et app
    const env = await loadEnvConfig();
    const adminConn = env.DATABASE_URL;
    if (!adminConn) {
      console.error(chalk.red("✖ DATABASE_URL manquant pour SQL direct admin."));
      throw new Error("Connexion admin requise");
    }
    const appUser = env.APP_DB_USER!;
    const appPass = env.APP_DB_PASSWORD!;

    // 3) Activation de l'API SQL Admin
    const { confirm: cApi } = await prompts({
      type: "confirm", name: "confirm",
      message: "Activer l’API Cloud SQL Admin ?",
      initial: true
    });
    if (cApi) {
      const ok = await enableSqlAdminApi(this.config.projectName);
      if (!ok) {
        console.error(chalk.red("✖ Activation de l'API SQL Admin échouée."));
        console.log(chalk.red(`→ Lancez manuellement : gcloud services enable sqladmin.googleapis.com --project=${this.config.projectName}`));
        throw new Error("API SQL Admin requise");
      }
    }

    // 4) Tentative via gcloud CLI
    console.log(chalk.yellow(`\n→ Création via gcloud CLI de "${appUser}"…`));
    const gc = spawnSync("gcloud", [
      "sql", "users", "create", appUser,
      `--instance=${instanceId}`,
      `--password=${appPass}`,
      `--project=${this.config.projectName}`
    ], { shell: true, stdio: "pipe" });
    if (gc.status === 0) {
      console.log(chalk.green(`✓ Utilisateur "${appUser}" créé via gcloud CLI.`));
      return;
    }
    const stderr = gc.stderr?.toString() ?? "";
    console.error(chalk.red(`✖ gcloud sql users create a échoué (code ${gc.status}) :`));
    console.error(chalk.red(stderr.trim()));
    console.log(chalk.red("→ Vérifiez l’ID d’instance et vos droits SQL Admin."));
    console.log(chalk.blue("Vous pouvez vérifier les instances Cloud SQL :"));
    console.log(chalk.cyan(`  gcloud sql instances list --project=${this.config.projectName}`));
    console.log(chalk.blue("Puis créer manuellement :"));
    console.log(chalk.cyan(`  gcloud sql users create ${appUser} --instance=${instanceId} --project=${this.config.projectName}`));

    // 5) Fallback SQL direct (admin)
    const { fallback } = await prompts({
      type: "confirm", name: "fallback",
      message: "Tenter la création via SQL direct en tant qu'admin ?",
      initial: true
    });
    if (!fallback) throw new Error("Échec création utilisateur DB");

    console.log(chalk.yellow("→ Connexion SQL direct en admin…"));
    const pgmod2 = await import("pg");
    const Client2 = pgmod2.Client ?? pgmod2.default?.Client;
    if (!Client2) {
      console.error(chalk.red("✖ pg.Client introuvable, SQL direct impossible."));
      throw new Error("Échec création utilisateur DB");
    }
    const client2 = new Client2({ connectionString: adminConn });
    try {
      await client2.connect();
      await client2.query(`CREATE USER "${appUser}" WITH PASSWORD $1`, [appPass]);
      console.log(chalk.green(`✓ Utilisateur "${appUser}" créé (SQL direct admin).`));
    } catch (err: any) {
      if (/already exists/i.test(err.message)) {
        console.log(chalk.yellow(`⚠ Utilisateur "${appUser}" existe déjà (SQL direct).`));
      } else {
        console.error(chalk.red(`✖ Échec SQL direct admin : ${err.message}`));
        console.log(chalk.red("→ Vérifiez les droits SQL admin et la connectivité réseau."));
        console.log(chalk.blue("Pour créer manuellement :"));
        console.log(chalk.cyan(`  psql "${adminConn}" -c "CREATE USER ${appUser} WITH PASSWORD '${appPass}';"`));
        throw new Error("Échec création utilisateur DB");
      }
    } finally {
      await client2.end();
    }
  }
}
