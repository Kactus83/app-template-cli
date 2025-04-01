import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import { Environment } from './docker-compose-service.js';
import { ServiceConfigManager } from './service-config-manager.js';

/**
 * Service de gestion des secrets.
 * Il expose deux fonctions principales :
 * - checkEnvFiles(targetDir): Vérifie que les fichiers .env.dev et .env.prod contiennent toutes les clés requises.
 * - repairEnvFiles(targetDir): Crée ou met à jour ces fichiers en ajoutant les clés manquantes avec des valeurs vides.
 * Les clés requises sont obtenues via TemplateService.listServices(env).
 */
export class SecretManagerService {
  /**
   * Agrège l’ensemble des clés de secrets déclarées dans les configurations des services.
   * Utilise TemplateService.listServices(env) pour récupérer la config de chaque service.
   * @param env Environnement ('dev' ou 'prod')
   * @returns Un Set contenant toutes les clés requises.
   */
  static async getAllSecretKeys(env: Environment): Promise<Set<string>> {
    const services = await ServiceConfigManager.listServices(env);
    const secretKeys = new Set<string>();
    for (const service of services) {
      if (Array.isArray(service.secrets)) {
        service.secrets.forEach(key => secretKeys.add(key));
      }
    }
    return secretKeys;
  }

  /**
   * Lit un fichier .env et renvoie un Set contenant les clés présentes.
   * Ignore les lignes vides et les commentaires.
   * @param filePath Chemin du fichier .env.
   * @returns Un Set contenant les clés lues.
   */
  static async readEnvFileKeys(filePath: string): Promise<Set<string>> {
    const keys = new Set<string>();
    if (await fs.pathExists(filePath)) {
      const content = await fs.readFile(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex > 0) {
          const key = trimmed.substring(0, eqIndex).trim();
          keys.add(key);
        }
      }
    }
    return keys;
  }

  /**
   * Vérifie la validité d'un fichier .env en s’assurant qu’il contient toutes les clés requises,
   * lesquelles sont obtenues via TemplateService.listServices(env).
   * @param filePath Chemin du fichier .env.
   * @param env Environnement ('dev' ou 'prod')
   * @returns true si toutes les clés sont présentes, false sinon.
   */
  static async checkEnvFile(filePath: string, env: Environment): Promise<boolean> {
    const requiredKeys = await this.getAllSecretKeys(env);
    const existingKeys = await this.readEnvFileKeys(filePath);
    for (const key of requiredKeys) {
      if (!existingKeys.has(key)) {
        console.log(chalk.yellow(`Clé manquante dans ${path.basename(filePath)} : ${key}`));
        return false;
      }
    }
    return true;
  }

  /**
   * Vérifie que les fichiers d'environnement .env.dev et .env.prod contiennent toutes les clés requises.
   * @param targetDir Répertoire où se trouvent les fichiers.
   * @returns true si les deux fichiers sont complets, false sinon.
   */
  static async checkEnvFiles(targetDir: string): Promise<boolean> {
    const envDevPath = path.join(targetDir, '.env.dev');
    const envProdPath = path.join(targetDir, '.env.prod');
    const devValid = await this.checkEnvFile(envDevPath, 'dev');
    const prodValid = await this.checkEnvFile(envProdPath, 'prod');
    return devValid && prodValid;
  }

  /**
   * Crée ou met à jour un fichier .env pour qu’il contienne toutes les clés requises.
   * Les clés manquantes sont ajoutées avec une valeur vide sans écraser les valeurs existantes.
   * Cette fonction ne tient pas compte d’un fichier générique .env et travaille uniquement sur le fichier ciblé.
   *
   * @param filePath Chemin du fichier .env ciblé (.env.dev ou .env.prod).
   * @param env Environnement ('dev' ou 'prod')
   */
  static async repairEnvFile(filePath: string, env: Environment): Promise<void> {
    const requiredKeys = await this.getAllSecretKeys(env);
    console.log(chalk.blue(`Clés requises pour ${path.basename(filePath)} : ${Array.from(requiredKeys).join(', ')}`));
    let content: string;
    if (await fs.pathExists(filePath)) {
      content = await fs.readFile(filePath, 'utf8');
    } else {
      console.log(chalk.blue(`Création du fichier ${path.basename(filePath)}...`));
      content = "# Fichier généré automatiquement. Veuillez renseigner les valeurs nécessaires.\n";
    }
    const existingKeys = await this.readEnvFileKeys(filePath);
    const missingKeys = [...requiredKeys].filter(key => !existingKeys.has(key));
    if (missingKeys.length > 0) {
      let appendContent = "\n# Clés ajoutées automatiquement - renseignez les valeurs\n";
      for (const key of missingKeys) {
        appendContent += `${key}=\n`;
      }
      content = content + appendContent;
      await fs.writeFile(filePath, content, 'utf8');
      console.log(chalk.green(`${path.basename(filePath)} mis à jour avec ${missingKeys.length} clé(s) manquante(s).`));
    } else {
      // Si le fichier n'existait pas, on l'écrit pour le créer.
      if (!(await fs.pathExists(filePath))) {
        await fs.writeFile(filePath, content, 'utf8');
        console.log(chalk.green(`${path.basename(filePath)} créé.`));
      } else {
        console.log(chalk.blue(`${path.basename(filePath)} contient déjà toutes les clés requises.`));
      }
    }
  }

  /**
   * Vérifie et génère (ou met à jour) les fichiers d'environnement (.env.dev et .env.prod)
   * dans le répertoire cible.
   * Cette fonction se contente de corriger/compléter les fichiers sans être impactée par un éventuel fichier générique .env.
   * @param targetDir Répertoire cible.
   */
  static async repairEnvFiles(targetDir: string): Promise<void> {
    const envDevPath = path.join(targetDir, '.env.dev');
    const envProdPath = path.join(targetDir, '.env.prod');
    await this.repairEnvFile(envDevPath, 'dev');
    await this.repairEnvFile(envProdPath, 'prod');
  }
}
