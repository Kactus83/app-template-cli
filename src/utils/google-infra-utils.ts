/**
 * Ce module regroupe les fonctions utilitaires pour vérifier les éléments
 * d'infrastructure Google Cloud, notamment la vérification des credentials,
 * de la base de données, du projet, de l'instance Filestore, ainsi que la gestion
 * des utilisateurs de la base (vérification, création, stockage des infos).
 */

import { existsSync } from "fs";
import { spawnSync, execSync } from "child_process";
import chalk from "chalk";
import prompts from "prompts";
import * as path from "path";
import { CliConfig } from "../config/cli-config.js";

/* -----------------------------------------------
   Fonctions Utilitaires de Vérification Générales
----------------------------------------------- */

/**
 * Vérifie si la variable GOOGLE_APPLICATION_CREDENTIALS existe et si le fichier correspondant est présent.
 */
export function verifyCredentials(): boolean {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (existsSync(keyPath)) {
      console.log(chalk.green("Credentials trouvés via GOOGLE_APPLICATION_CREDENTIALS."));
      return true;
    } else {
      console.error(chalk.red(`Le fichier de credentials spécifié (${keyPath}) n'existe pas.`));
    }
  }
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
  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      console.log(chalk.green(`Application Default Credentials trouvés dans : ${filePath}`));
      return true;
    }
  }
  console.error(chalk.red("Aucun Application Default Credentials n'a été trouvé."));
  return false;
}

/**
 * Tente d'automatiser l'authentification en lançant "gcloud auth application-default login".
 * Cette commande est interactive.
 */
export function autoLoginIfNeeded(): void {
  if (!verifyCredentials()) {
    console.warn(chalk.yellow("Les credentials Google Application Default ne sont pas configurés."));
    console.warn(chalk.yellow("Lancement de 'gcloud auth application-default login' pour corriger automatiquement..."));
    spawnSync("gcloud", ["auth", "application-default", "login"], { stdio: "inherit" });
    if (verifyCredentials()) {
      console.log(chalk.green("Les credentials ont été configurés avec succès."));
    } else {
      console.error(chalk.red("Échec de l'authentification automatique. Veuillez exécuter manuellement 'gcloud auth application-default login'."));
      process.exit(1);
    }
  }
}

/**
 * Vérifie la connexion à la base de données PostgreSQL.
 */
export async function verifyDatabase(): Promise<boolean> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error(chalk.red("DATABASE_URL n'est pas défini dans .env.prod."));
    return false;
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString });
  try {
    await client.connect();
    await client.query("SELECT 1");
    console.log(chalk.green("La base de données est accessible."));
    return true;
  } catch (error) {
    console.error(chalk.red("Erreur lors de la connexion à la base de données:"), error);
    return false;
  } finally {
    await client.end();
  }
}

/**
 * Active l'API Cloud Filestore pour le projet.
 */
export async function enableFilestoreApi(projectId: string): Promise<boolean> {
  try {
    console.log(chalk.yellow(`Activation de l'API Cloud Filestore pour le projet ${projectId}...`));
    execSync(`gcloud services enable file.googleapis.com --project=${projectId}`, { stdio: "inherit" });
    console.log(chalk.yellow("Attente de la propagation de l'activation de l'API..."));
    await new Promise(resolve => setTimeout(resolve, 60000));
    return true;
  } catch (error) {
    console.error(chalk.red("Erreur lors de l'activation de l'API Cloud Filestore:"), error);
    return false;
  }
}

/**
 * Vérifie l'état de l'instance Filestore.
 * Pour Filestore, la commande requiert une zone (ex: "europe-west1-b").
 */
export async function verifyFilestore(projectId: string, zone: string, filestoreName: string): Promise<boolean> {
  try {
    console.log(chalk.blue("Vérification de l'instance Filestore sur Google Cloud..."));
    const cmd = `gcloud filestore instances describe ${filestoreName} --project=${projectId} --location=${zone} --format=json`;
    const output = execSync(cmd, { encoding: "utf8" });
    const info = JSON.parse(output);
    if (info.state === "READY") {
      console.log(chalk.green("L'instance Filestore est opérationnelle."));
      return true;
    } else {
      console.warn(chalk.yellow(`Filestore existe mais son état est '${info.state}'.`));
      return false;
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("NOT_FOUND")) {
      console.warn(chalk.yellow(`L'instance Filestore "filestore-sandbox" n'a pas été trouvée dans la zone ${zone}.`));
      return false;
    }
    if (error instanceof Error && error.message.includes("SERVICE_DISABLED")) {
      console.warn(chalk.yellow("L'API Cloud Filestore n'est pas activée. Activation automatique en cours..."));
      const enabled = await enableFilestoreApi(projectId);
      if (enabled) {
        console.log(chalk.green("API activée, nouvelle tentative..."));
        try {
          const outputRetry = execSync(`gcloud filestore instances describe ${filestoreName} --project=${projectId} --location=${zone} --format=json`, { encoding: "utf8" });
          const infoRetry = JSON.parse(outputRetry);
          if (infoRetry.state === "READY") {
            console.log(chalk.green("L'instance Filestore est opérationnelle."));
            return true;
          } else {
            console.warn(chalk.yellow(`Filestore existe mais son état est '${infoRetry.state}'.`));
            return false;
          }
        } catch (err) {
          console.error(chalk.red("Échec de la vérification de Filestore après activation de l'API."));
          return false;
        }
      }
      return false;
    }
    console.error(chalk.red("Erreur lors de la vérification de Filestore. Veuillez vérifier manuellement dans la console Google Cloud."));
    return false;
  }
}

/**
 * Vérifie la validité du projet Google Cloud.
 */
export function verifyProject(projectId: string): boolean {
  try {
    console.log(chalk.blue("Vérification du projet Google Cloud..."));
    const cmd = `gcloud projects describe ${projectId} --format=json`;
    const output = execSync(cmd, { encoding: "utf8" });
    const info = JSON.parse(output);
    if (info.projectId === projectId) {
      console.log(chalk.green(`Le projet "${projectId}" est valide.`));
      return true;
    } else {
      console.warn(chalk.yellow(`Le projet décrit ne correspond pas à "${projectId}".`));
      return false;
    }
  } catch (error) {
    console.error(chalk.red("Erreur lors de la vérification du projet:"), error);
    return false;
  }
}

/* -----------------------------------------------
   Fonctions pour la gestion de l'utilisateur DB
----------------------------------------------- */

/**
 * Vérifie si l'utilisateur DB spécifié existe dans l'instance Cloud SQL.
 */
export async function verifyDBUser(username: string, config: CliConfig): Promise<boolean> {
  try {
    console.log(chalk.blue(`Vérification de l'existence de l'utilisateur DB "${username}"...`));
    const instanceName = process.env.SQL_INSTANCE_NAME || "sql-sandbox";
    const cmd = `gcloud sql users list --instance=${instanceName} --project=${config.projectName} --format=json`;
    const output = execSync(cmd, { encoding: "utf8" });
    const users = JSON.parse(output);
    const exists = Array.isArray(users) && users.some((user: any) => user.name === username);
    if (exists) {
      console.log(chalk.green(`L'utilisateur DB "${username}" existe déjà.`));
    } else {
      console.warn(chalk.yellow(`L'utilisateur DB "${username}" n'existe pas.`));
    }
    return exists;
  } catch (error) {
    console.error(chalk.red("Erreur lors de la vérification de l'utilisateur DB:"), error);
    return false;
  }
}

/**
 * Demande les informations nécessaires et crée l'utilisateur DB via la commande gcloud.
 */
export async function createDBUser(username: string, config: CliConfig): Promise<boolean> {
  const userInput = await prompts([
    {
      type: "text",
      name: "username",
      message: `Veuillez confirmer le nom d'utilisateur DB à créer (défaut: ${username}) :`,
      initial: username
    },
    {
      type: "password",
      name: "password",
      message: "Entrez le mot de passe pour cet utilisateur :"
    }
  ]);
  if (!userInput.username || !userInput.password) {
    console.error(chalk.red("Nom d'utilisateur et mot de passe sont obligatoires pour créer un utilisateur DB."));
    return false;
  }
  const instanceName = process.env.SQL_INSTANCE_NAME || "sql-sandbox";
  const cmdArgs = [
    "sql", "users", "create", userInput.username,
    "--instance", instanceName,
    "--password", userInput.password,
    "--project", config.projectName
  ];
  console.log(chalk.yellow(`Création de l'utilisateur DB "${userInput.username}"...`));
  const result = spawnSync("gcloud", cmdArgs, { stdio: "inherit" });
  if (result.status === 0) {
    console.log(chalk.green("Utilisateur DB créé avec succès."));
    return true;
  } else {
    console.error(chalk.red("Erreur lors de la création de l'utilisateur DB."));
    return false;
  }
}

/**
 * Extrait et stocke les informations relatives à l'utilisateur DB.
 * Vous pouvez étendre cette fonction pour mettre à jour votre fichier de configuration (.env.prod).
 */
export function storeDBUserData(username: string): void {
  console.log(chalk.green(`Les informations de l'utilisateur DB "${username}" ont été enregistrées pour une utilisation ultérieure.`));
}

/**
 * Fonction principale qui vérifie, et crée si nécessaire, l'utilisateur DB,
 * puis stocke les informations associées.
 */
export async function ensureDBUserInGoogle(config: CliConfig): Promise<void> {
  const defaultUsername = "appuser";
  const exists = await verifyDBUser(defaultUsername, config);
  if (!exists) {
    const response = await prompts({
      type: "confirm",
      name: "createUser",
      message: `L'utilisateur DB "${defaultUsername}" n'existe pas. Voulez-vous le créer ?`,
      initial: true
    });
    if (response.createUser) {
      const created = await createDBUser(defaultUsername, config);
      if (created) {
        storeDBUserData(defaultUsername);
      } else {
        console.error(chalk.red("La création de l'utilisateur DB a échoué."));
      }
    } else {
      console.warn(chalk.yellow("La création de l'utilisateur DB a été annulée par l'utilisateur."));
    }
  } else {
    storeDBUserData(defaultUsername);
  }
}
