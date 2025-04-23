import fs from "fs-extra";
import * as path from "path";
import prompts from "prompts";
import chalk from "chalk";
import { loadEnvConfig, writeEnv } from "./env-utils.js";

/**
 * Retourne true si POSTGRES_USER, POSTGRES_PASSWORD et POSTGRES_DB
 * sont tous définis (non vides) dans .env.prod.
 */
export async function hasDbCredentialsInEnv(): Promise<boolean> {
  const env = await loadEnvConfig();
  return Boolean(
    env.POSTGRES_USER?.trim() &&
    env.POSTGRES_PASSWORD?.trim() &&
    env.POSTGRES_DB?.trim()
  );
}

/**
 * Invite l'utilisateur à saisir POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB
 * et les enregistre dans .env.prod. En cas de saisie incomplète, quitte le process.
 */
export async function promptAndStoreDbCredentials(): Promise<void> {
  console.log(chalk.yellow("\n⚙️  Configuration des identifiants DB manquants dans .env.prod"));

  // Charge l'existant (pour préserver les autres clés)
  const env = await loadEnvConfig();

  // On demande chaque valeur
  const responses = await prompts([
    {
      type: "text",
      name: "POSTGRES_USER",
      message: "Nom d'utilisateur PostgreSQL",
      initial: env.POSTGRES_USER || "",
    },
    {
      type: "password",
      name: "POSTGRES_PASSWORD",
      message: "Mot de passe PostgreSQL",
    },
    {
      type: "text",
      name: "POSTGRES_DB",
      message: "Nom de la base de données (POSTGRES_DB)",
      initial: env.POSTGRES_DB || "",
    }
  ]);

  // Validation basique
  if (!responses.POSTGRES_USER || !responses.POSTGRES_PASSWORD || !responses.POSTGRES_DB) {
    console.error(chalk.red("✖ Toutes les informations DB sont requises. Abandon."));
    process.exit(1);
  }

  // Mise à jour et sauvegarde
  env.POSTGRES_USER     = responses.POSTGRES_USER;
  env.POSTGRES_PASSWORD = responses.POSTGRES_PASSWORD;
  env.POSTGRES_DB       = responses.POSTGRES_DB;

  await writeEnv(env);
  console.log(chalk.green("✓ .env.prod mis à jour avec les credentials DB."));
}