import fs from 'fs-extra';
import * as path from 'path';
import { CliConfig, defaultCliConfig } from '../config/cli-config.js';

export class ConfigService {
  /**
   * Chemin relatif du fichier de configuration dans le projet.
   */
  static configFileName = '.app-template';

  /**
   * Retourne le chemin absolu du fichier de configuration dans le dossier cible.
   * @param targetDir Répertoire cible.
   */
  static getConfigPath(targetDir: string): string {
    return path.join(targetDir, ConfigService.configFileName);
  }

  /**
   * Vérifie si le fichier de configuration existe dans targetDir.
   * S'il n'existe pas, copie la configuration par défaut.
   * Puis, met à jour le projectName et écrit le fichier.
   * @param targetDir Répertoire cible.
   * @param projectName Nouveau projectName.
   */
  static async ensureOrUpdateConfig(targetDir: string, projectName: string): Promise<void> {
    const configPath = ConfigService.getConfigPath(targetDir);
    let configContent: CliConfig;
    if (await fs.pathExists(configPath)) {
      try {
        const fileData = await fs.readFile(configPath, 'utf8');
        configContent = JSON.parse(fileData) as CliConfig;
      } catch (error) {
        throw new Error(`Erreur lors de la lecture du fichier de configuration existant: ${error}`);
      }
    } else {
      // Copier la configuration par défaut
      configContent = { ...defaultCliConfig };
    }
    // Mettre à jour le projectName
    configContent.projectName = projectName;
    await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));
  }
}
