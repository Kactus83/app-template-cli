import fs from "fs-extra";
import { existsSync } from "fs";
import * as path from "path";
import { spawnSync, execSync } from "child_process";
import chalk from "chalk";
import prompts from "prompts";
import { CliConfig } from "../config/cli-config.js";
import { loadEnvConfig } from "./env-utils.js";

/* ────────────────────────────────────────────────────────────────────────────
   SECTION 2: Vérifications générales (Google Cloud SDK / credentials)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Vérifie si la variable GOOGLE_APPLICATION_CREDENTIALS est définie dans
 * .env.prod et que le fichier existe, ou cherche les ADC par défaut.
 */
export async function verifyCredentials(): Promise<boolean> {
  const envConfig = await loadEnvConfig();
  if (envConfig.GOOGLE_APPLICATION_CREDENTIALS) {
    const keyPath = envConfig.GOOGLE_APPLICATION_CREDENTIALS;
    if (existsSync(keyPath)) {
      console.log(chalk.green("✅ Credentials trouvés via GOOGLE_APPLICATION_CREDENTIALS."));
      return true;
    } else {
      console.error(chalk.red(`✖ Le fichier de credentials spécifié (${keyPath}) n'existe pas.`));
    }
  }
  // Chemins ADC par défaut
  const possiblePaths: string[] = [];
  if (process.env.APPDATA) {
    possiblePaths.push(path.join(process.env.APPDATA, "gcloud", "application_default_credentials.json"));
  }
  if (process.env.HOME) {
    possiblePaths.push(path.join(process.env.HOME, ".config", "gcloud", "application_default_credentials.json"));
  }
  if (process.env.USERPROFILE) {
    possiblePaths.push(path.join(process.env.USERPROFILE, ".config", "gcloud", "application_default_credentials.json"));
  }
  for (const p of possiblePaths) {
    if (existsSync(p)) {
      console.log(chalk.green(`✅ ADC trouvés dans : ${p}`));
      return true;
    }
  }
  console.error(chalk.red("✖ Aucun Application Default Credentials trouvé."));
  return false;
}

/**
 * Tente d'automatiser l'authentification en lançant
 * "gcloud auth application-default login".
 */
export async function autoLoginIfNeeded(): Promise<void> {
  if (!(await verifyCredentials())) {
    console.log(chalk.yellow("⚠ Authentification Google manquante."));
    console.log(chalk.yellow("→ Lancement de 'gcloud auth application-default login'..."));
    spawnSync("gcloud", ["auth", "application-default", "login"], { stdio: "inherit" });
    if (await verifyCredentials()) {
      console.log(chalk.green("✅ Authentification automatique réussie."));
    } else {
      console.error(chalk.red("✖ Échec de l'authentification automatique."));
      process.exit(1);
    }
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   SECTION 3: Vérification de la base de données (Cloud SQL)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Vérifie la connexion à la base de données PostgreSQL via DATABASE_URL.
 */
export async function verifyDatabase(): Promise<boolean> {
  const envConfig = await loadEnvConfig();
  const connectionString = envConfig.DATABASE_URL;
  if (!connectionString) {
    console.error(chalk.red("✖ DATABASE_URL n'est pas défini dans .env.prod."));
    return false;
  }

  const pgModule = await import("pg");
  const Client = pgModule.Client || (pgModule.default && pgModule.default.Client);
  if (typeof Client !== "function") {
    console.error(chalk.red("✖ Impossible de récupérer Client depuis 'pg'."));
    return false;
  }

  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log(chalk.green("✅ La base de données est accessible."));
    return true;
  } catch (error: any) {
    // ECONNREFUSED = pas de listener → on considère que l'instance n'existe pas / n'est pas prête
    if (error.code === "ECONNREFUSED") {
      console.warn(chalk.yellow("⚠ Connexion refusée (ECONNREFUSED), l'instance Cloud SQL est peut‑être absente."));
      return false;
    }
    if (error.code === "28P01") {
      console.warn(chalk.yellow("⚠ Authentification échouée (28P01), utilisateur peut-être manquant."));
      return true;
    }
    console.error(chalk.red("✖ Erreur lors de la connexion à la base de données:"), error);
    return false;
  } finally {
    try { await client.end(); } catch (_) { }
  }
}

/**
 * Active l'API Cloud SQL Admin pour le projet (interactif si besoin).
 */
export async function enableSqlAdminApi(projectId: string): Promise<boolean> {
  console.log(chalk.yellow(`→ Activation de l'API Cloud SQL Admin pour le projet ${projectId}…`));
  try {
    execSync(`gcloud services enable sqladmin.googleapis.com --project=${projectId}`, { stdio: "inherit" });
    console.log(chalk.yellow("⏳ Attente de propagation (30s)…"));
    await new Promise(r => setTimeout(r, 30000));
    return true;
  } catch (err) {
    console.error(chalk.red("✖ Échec de l'activation Cloud SQL Admin API:"), err);
    return false;
  }
}

/**
 * Vérifie si l'utilisateur DB existe dans Cloud SQL, propose d’activer l’API si nécessaire.
 */
export async function verifyDBUser(username: string, config: CliConfig): Promise<boolean> {
  console.log(chalk.blue(`→ Vérification de l'utilisateur DB "${username}"…`));
  const envConfig = await loadEnvConfig();
  const instanceName = envConfig.SQL_INSTANCE_NAME || "sql-sandbox";
  const cmd = `gcloud sql users list --instance=${instanceName} --project=${config.projectName} --format=json`;

  try {
    const output = execSync(cmd, { encoding: "utf8" });
    const users = JSON.parse(output);
    const exists = Array.isArray(users) && users.some((u: any) => u.name === username);
    console.log(
      exists
        ? chalk.green(`✅ Utilisateur "${username}" existe.`)
        : chalk.yellow(`⚠ Utilisateur "${username}" absent.`)
    );
    return exists;
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message;
    if (msg.includes("SERVICE_DISABLED")) {
      console.warn(chalk.yellow("⚠ Cloud SQL Admin API non activée."));
      const { enable } = await prompts({
        type: "confirm", name: "enable",
        message: "Voulez-vous activer l'API Cloud SQL Admin maintenant ?",
        initial: true
      });
      if (enable && await enableSqlAdminApi(config.projectName)) {
        return verifyDBUser(username, config);
      }
    }
    console.error(chalk.red("✖ Erreur lors de la vérification de l'utilisateur DB:"), msg);
    return false;
  }
}

/**
 * Crée un utilisateur DB via gcloud SQL CLI.
 */
export async function createDBUser(username: string, config: CliConfig): Promise<boolean> {
  console.log(chalk.blue(`→ Création de l'utilisateur DB "${username}"…`));
  const { username: confirmed, password } = await prompts([
    { type: "text", name: "username", message: `Confirmez le nom d'utilisateur (défaut: ${username}):`, initial: username },
    { type: "password", name: "password", message: "Entrez le mot de passe :" }
  ]);
  if (!confirmed || !password) {
    console.error(chalk.red("✖ Nom d'utilisateur et mot de passe obligatoires."));
    return false;
  }

  const envConfig = await loadEnvConfig();
  const instanceName = envConfig.SQL_INSTANCE_NAME || "sql-sandbox";
  const args = [
    "sql", "users", "create", confirmed,
    "--instance", instanceName,
    "--password", password,
    "--project", config.projectName
  ];

  const res = spawnSync("gcloud", args, { stdio: "inherit" });
  if (res.status === 0) {
    console.log(chalk.green(`✅ Utilisateur "${confirmed}" créé avec succès.`));
    return true;
  } else {
    console.error(chalk.red("✖ Échec de la création de l'utilisateur DB."));
    return false;
  }
}

/**
 * Stocke les infos de l'utilisateur DB pour usage ultérieur.
 */
export function storeDBUserData(username: string): void {
  console.log(chalk.green(`ℹ️  Infos utilisateur "${username}" enregistrées.`));
}

/**
 * Vérifie puis crée si nécessaire l'utilisateur DB dans Google Cloud.
 */
export async function ensureDBUserInGoogle(config: CliConfig): Promise<void> {
  const defaultUser = "appuser";
  const exists = await verifyDBUser(defaultUser, config);
  if (!exists) {
    const { createUser } = await prompts({
      type: "confirm", name: "createUser",
      message: `L'utilisateur DB "${defaultUser}" n'existe pas. Voulez-vous le créer ?`,
      initial: true
    });
    if (createUser) {
      const ok = await createDBUser(defaultUser, config);
      if (ok) storeDBUserData(defaultUser);
      else console.error(chalk.red("✖ Création de l'utilisateur DB échouée."));
    } else {
      console.warn(chalk.yellow("⚠ Création de l'utilisateur DB annulée."));
    }
  } else {
    storeDBUserData(defaultUser);
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   SECTION 4: Vérification du stockage (Cloud Filestore)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Active l'API Filestore pour un projet.
 */
export async function enableFilestoreApi(projectId: string): Promise<boolean> {
  console.log(chalk.yellow(`→ Activation de l'API Filestore (${projectId})…`));
  try {
    execSync(`gcloud services enable file.googleapis.com --project=${projectId}`, { stdio: "inherit" });
    console.log(chalk.yellow("⏳ Attente de propagation (60s)…"));
    await new Promise(r => setTimeout(r, 60000));
    return true;
  } catch (err) {
    console.error(chalk.red("✖ Échec activation API Filestore:"), err);
    return false;
  }
}

/**
 * Vérifie l'état de l'instance Filestore (READY), propose d’activer l’API si besoin.
 */
export async function verifyFilestore(projectId: string, zone: string, filestoreName: string): Promise<boolean> {
  console.log(chalk.blue(`→ Vérification de l'instance Filestore "${filestoreName}"…`));
  try {
    const raw = execSync(
      `gcloud filestore instances describe ${filestoreName} --project=${projectId} --location=${zone} --format=json`,
      { encoding: "utf8" }
    );
    const info = JSON.parse(raw);
    if (info.state === "READY") {
      console.log(chalk.green("✅ Filestore READY."));
      return true;
    }
    console.warn(chalk.yellow(`⚠ Filestore état: ${info.state}`));
    return false;
  } catch (err: any) {
    const msg = err.stderr?.toString() || err.message;
    if (msg.includes("NOT_FOUND")) {
      console.warn(chalk.yellow(`⚠ Filestore "${filestoreName}" non trouvé.`));
      return false;
    }
    if (msg.includes("SERVICE_DISABLED")) {
      console.warn(chalk.yellow("⚠ API Filestore non activée."));
      const { enable } = await prompts({
        type: "confirm", name: "enable",
        message: "Voulez-vous activer l'API Filestore ?",
        initial: true
      });
      if (enable && await enableFilestoreApi(projectId)) {
        return verifyFilestore(projectId, zone, filestoreName);
      }
    }
    console.error(chalk.red("✖ Erreur vérification Filestore:"), msg);
    return false;
  }
}

/**
 * Vérifie la validité du projet Google Cloud.
 */
export async function verifyProject(projectId: string): Promise<boolean> {
  console.log(chalk.blue(`→ Vérification du projet "${projectId}"…`));
  try {
    const raw = execSync(`gcloud projects describe ${projectId} --format=json`, { encoding: "utf8" });
    const info = JSON.parse(raw);
    if (info.projectId === projectId) {
      console.log(chalk.green("✅ Projet valide."));
      return true;
    }
    console.warn(chalk.yellow("⚠ Projet décrit ne correspond pas."));
    return false;
  } catch (err) {
    console.error(chalk.red("✖ Erreur vérification projet:"), err);
    return false;
  }
}

/* ────────────────────────────────────────────────────────────────────────────
   SECTION 5: Docker Registry Authentication
───────────────────────────────────────────────────────────────────────────── */

/**
 * Vérifie la configuration Docker pour le registry (credHelpers).
 */
export async function checkDockerAuthForRegistry(registryHost: string): Promise<boolean> {
  console.log(chalk.blue(`→ Vérif. Docker auth pour ${registryHost}…`));
  const dockerConfigPath = path.join(process.env.HOME || process.env.USERPROFILE || "", ".docker", "config.json");
  if (await fs.pathExists(dockerConfigPath)) {
    const content = await fs.readFile(dockerConfigPath, "utf8");
    const cfg = JSON.parse(content);
    if (cfg.credHelpers?.[registryHost]) {
      console.log(chalk.green(`✅ Docker déjà configuré pour ${registryHost}.`));
      return true;
    }
  }
  console.warn(chalk.yellow(`⚠ Docker non configuré pour ${registryHost}.`));
  return false;
}

/**
 * Configure Docker pour utiliser gcloud comme credential helper.
 */
export function configureDockerForRegistry(registryHost: string): void {
  console.log(chalk.blue(`→ Configuration Docker pour ${registryHost} via gcloud…`));
  execSync(`gcloud auth configure-docker ${registryHost}`, { stdio: "inherit" });
  console.log(chalk.green(`✅ Docker configuré pour ${registryHost}.`));
}

/**
 * Assure que Docker est configuré pour l’artifact registry.
 */
export async function ensureDockerAuthForRegistry(artifactRegistry: string): Promise<void> {
  const registryHost = artifactRegistry.split('/')[0];
  if (!(await checkDockerAuthForRegistry(registryHost))) {
    configureDockerForRegistry(registryHost);
  }
}
