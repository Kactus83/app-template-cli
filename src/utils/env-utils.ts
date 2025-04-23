import fs from "fs-extra";
import * as path from "path";

const ENV_PATH = path.join(process.cwd(), ".env.prod");

/* ────────────────────────────────────────────────────────────────────────────
   SECTION 1: Chargement de l’environnement (.env.prod)
───────────────────────────────────────────────────────────────────────────── */

/**
 * Charge le fichier .env.prod situé à la racine du projet et retourne un objet
 * contenant les paires clé/valeur.
 */
export async function loadEnvConfig(): Promise<Record<string, string>> {
    const envPath = path.join(process.cwd(), ".env.prod");
    if (!(await fs.pathExists(envPath))) {
      throw new Error(`Le fichier .env.prod est introuvable dans ${process.cwd()}`);
    }
    const content = await fs.readFile(envPath, "utf8");
    const config: Record<string, string> = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex !== -1) {
        const key = trimmed.substring(0, eqIndex).trim();
        const value = trimmed.substring(eqIndex + 1).trim();
        config[key] = value;
      }
    }
    return config;
  }

/**
 * Sauvegarde l'objet clé/valeur dans .env.prod (remplace tout le fichier).
 */
export async function writeEnv(env: Record<string,string>): Promise<void> {
    const text = Object.entries(env)
      .map(([k,v]) => `${k}=${v}`)
      .join("\n");
    await fs.writeFile(ENV_PATH, text, "utf8");
  }