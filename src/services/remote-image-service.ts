import { execSync } from 'child_process';
import chalk from 'chalk';
import { ServiceConfigManager } from '../services/service-config-manager.js';
import { GoogleProviderConfig, AWSProviderConfig } from '../config/cli-config.js';

/**
 * Service autonome pour vérifier si toutes les images Docker d'environnement prod sont présentes en remote.
 */
export class RemoteImageService {
  /**
   * Vérifie la présence de toutes les images pour l'environnement 'prod' sur le registry.
   * Utilise le tag 'latest' par défaut.
   * @param {GoogleProviderConfig | AWSProviderConfig} provider Configuration du provider contenant artifactRegistry.
   * @returns {Promise<boolean>} true si toutes les images sont présentes, false sinon.
   */
  static async allImagesExist(
    provider: GoogleProviderConfig | AWSProviderConfig
  ): Promise<boolean> {
    let services;
    try {
      services = await ServiceConfigManager.listServices('prod');
    } catch (err) {
      console.error(chalk.red('✖ Impossible de récupérer la liste des services prod :'), err);
      return false;
    }

    for (const svc of services) {
      const imageRef = `${provider.artifactRegistry}/${svc.name}:latest`;
      try {
        execSync(`docker manifest inspect ${imageRef}`, { stdio: 'ignore' });
        console.log(chalk.blue(`✓ Image trouvée en remote: ${imageRef}`));
      } catch {
        console.log(chalk.yellow(`✗ Image non trouvée en remote: ${imageRef}`));
        return false;
      }
    }

    return true;
  }
}
