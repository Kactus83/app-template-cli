import fs from 'fs-extra';
import * as path from 'path';
import { CliConfig, defaultCliConfig, Provider, ProviderConfig, InfraPerformance } from '../config/cli-config.js';
import prompts from 'prompts';
import {
  correctRegionInput,
  validateZoneInput,
  suggestZonesForRegion,
  isValidRegion,
  GOOGLE_CLOUD_REGIONS
} from '../utils/google-naming-utils.js';

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
   * Met ensuite à jour le projectName et écrit le fichier.
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
      // Utilisation de la configuration par défaut
      configContent = { ...defaultCliConfig };
    }
    configContent.projectName = projectName;
    await fs.writeFile(configPath, JSON.stringify(configContent, null, 2));
  }

  /**
   * Récupère la configuration CLI depuis le fichier de configuration.
   * Si le fichier n'existe pas, retourne la configuration par défaut.
   * @param targetDir Répertoire cible (par défaut le dossier courant).
   * @returns La configuration CLI.
   */
  static async getConfig(targetDir: string = process.cwd()): Promise<CliConfig> {
    const configPath = ConfigService.getConfigPath(targetDir);
    if (await fs.pathExists(configPath)) {
      try {
        const fileData = await fs.readFile(configPath, 'utf8');
        return JSON.parse(fileData) as CliConfig;
      } catch (error) {
        throw new Error(`Erreur lors de la lecture de la configuration: ${error}`);
      }
    } else {
      return { ...defaultCliConfig };
    }
  }

  /**
   * Vérifie que la configuration contient un provider.
   * Si le fichier n'existe pas ou si le provider est manquant, demande à l'utilisateur de renseigner ces informations et sauvegarde la configuration.
   * Cette fonction est conçue pour être appelée lors du déploiement.
   * @param targetDir Répertoire cible (par défaut le dossier courant).
   * @returns La configuration CLI complétée.
   */
  static async ensureOrPromptConfig(targetDir: string = process.cwd()): Promise<CliConfig> {
    const configPath = ConfigService.getConfigPath(targetDir);
    let config: CliConfig;
    if (await fs.pathExists(configPath)) {
      try {
        const fileData = await fs.readFile(configPath, 'utf8');
        config = JSON.parse(fileData) as CliConfig;
      } catch (error) {
        throw new Error(`Erreur lors de la lecture de la configuration existante: ${error}`);
      }
    } else {
      config = { ...defaultCliConfig };
      console.log(`Aucune configuration trouvée. Utilisation de la configuration par défaut.`);
    }

    // Si le provider est manquant ou incomplet, on demande à l'utilisateur de le renseigner.
    if (!config.provider || !config.provider.name || !config.provider.artifactRegistry) {
      console.log(`La configuration du provider est manquante ou incomplète. Veuillez la renseigner :`);
      const responses = await prompts([
        {
          type: 'select',
          name: 'providerName',
          message: 'Sélectionnez votre provider:',
          choices: [
            { title: 'Google Cloud', value: Provider.GOOGLE_CLOUD },
            { title: 'AWS', value: Provider.AWS },
          ]
        },
        {
          type: 'text',
          name: 'artifactRegistry',
          message: 'Entrez l\'URL ou l\'identifiant de votre registry d\'artifacts:',
          validate: value => (value && value.trim().length > 0 ? true : 'Cette valeur ne peut être vide.')
        }
      ]);

      let additional: Partial<ProviderConfig> = {};
      if (responses.providerName === Provider.GOOGLE_CLOUD) {
        const regionResp = await prompts({
          type: 'text',
          name: 'region',
          message: 'Entrez la région Google Cloud (ex: us-central1):',
          validate: value => {
            const corrected = correctRegionInput(value);
            return isValidRegion(corrected) ? true : `Valeur invalide. Choix possibles: ${GOOGLE_CLOUD_REGIONS.join(', ')}`;
          }
        });
        additional.region = regionResp.region;

        const zoneResp = await prompts({
          type: 'text',
          name: 'zone',
          message: 'Entrez la zone pour Filestore (ex: us-central1-a):',
          validate: value => {
            const validZone = validateZoneInput(value);
            if (validZone) {
              return true;
            } else {
              const suggestions = additional.region ? suggestZonesForRegion(additional.region) : [];
              return suggestions.length ? `Valeur invalide. Choisissez parmi: ${suggestions.join(', ')}` : 'Valeur invalide.';
            }
          }
        });
        additional.zone = zoneResp.zone;
      } else if (responses.providerName === Provider.AWS) {
        const awsResp = await prompts([
          {
            type: 'text',
            name: 'subnetId',
            message: 'Entrez l\'ID du subnet pour AWS:',
            validate: value => (value && value.trim().length > 0 ? true : 'Cette valeur ne peut être vide.')
          },
          {
            type: 'list',
            name: 'securityGroups',
            message: 'Entrez les IDs des groupes de sécurité pour AWS (séparés par une virgule):',
            separator: ',',
            validate: value => (value && value.length > 0 ? true : 'Veuillez fournir au moins un groupe de sécurité.')
          }
        ]);
        additional.subnetId = awsResp.subnetId;
        additional.securityGroups = awsResp.securityGroups;
      }
      // Demande le niveau de performance pour tous les providers
      const perfResp = await prompts({
        type: 'select',
        name: 'performance',
        message: 'Sélectionnez le niveau de performance pour votre infrastructure:',
        choices: [
          { title: 'Low', value: InfraPerformance.LOW },
          { title: 'Medium', value: InfraPerformance.MEDIUM },
          { title: 'High', value: InfraPerformance.HIGH }
        ]
      });
      additional.performance = perfResp.performance;

      const providerConfig: ProviderConfig = {
        name: responses.providerName,
        artifactRegistry: responses.artifactRegistry,
        ...additional
      };
      config.provider = providerConfig;
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(`Configuration mise à jour avec succès dans ${configPath}`);
    } else {
      console.log(`Configuration du provider déjà renseignée.`);
      // Même si la configuration existe, on vérifie que le niveau de performance est défini.
      if (!config.provider.performance) {
        const perfResp = await prompts({
          type: 'select',
          name: 'performance',
          message: 'Sélectionnez le niveau de performance pour votre infrastructure:',
          choices: [
            { title: 'Low', value: InfraPerformance.LOW },
            { title: 'Medium', value: InfraPerformance.MEDIUM },
            { title: 'High', value: InfraPerformance.HIGH }
          ]
        });
        config.provider.performance = perfResp.performance;
        await fs.writeFile(configPath, JSON.stringify(config, null, 2));
        console.log(`Configuration mise à jour avec le niveau de performance dans ${configPath}`);
      }
    }
    return config;
  }
}
