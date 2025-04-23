import fs from 'fs-extra';
import * as path from 'path';
import { CliConfig, defaultCliConfig, Provider, ProviderConfig, AWSProviderConfig, GoogleProviderConfig, GoogleCliConfig, AWSCliConfig } from '../config/cli-config.js';
import { CommonConfig, promptCommonProviderConfig } from '../utils/providers-config-utils.js';
import { promptAWSConfig } from '../utils/aws-config-utils.js';
import { promptGoogleConfig } from '../utils/google-config-utils.js';
import chalk from 'chalk';
import prompts from 'prompts';

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
   * Assure que la configuration CLI possède une section provider complète.
   * Si des informations sont manquantes, l'utilisateur est guidé interactivement pour renseigner les données nécessaires.
   *
   * Le retour est typé de sorte que la configuration retournée est garantie d'avoir une propriété provider
   * conforme à l'une des interfaces spécifiques (GoogleProviderConfig ou AWSProviderConfig).
   *
   * @param targetDir Répertoire cible (par défaut process.cwd())
   * @returns La configuration complétée, de type 
   *   (CliConfig & { provider: GoogleProviderConfig }) | (CliConfig & { provider: AWSProviderConfig })
   */
  static async ensureOrPromptProviderConfig(
    targetDir: string = process.cwd()
  ): Promise<GoogleCliConfig | AWSCliConfig> {
    const configPath = this.getConfigPath(targetDir);
    let config: CliConfig;

    // --- 1) Charger ou créer la config ---
    if (await fs.pathExists(configPath)) {
      try {
        config = JSON.parse(await fs.readFile(configPath, 'utf8'));
      } catch (e: any) {
        throw new Error(`Impossible de lire la config existante : ${e.message}`);
      }
    } else {
      config = { ...defaultCliConfig };
      console.log(chalk.yellow('Aucune config trouvée, valeurs par défaut utilisées.'));
    }

    // 2) Déterminer si le provider actuel est complet
    const p = config.provider as Partial<ProviderConfig> | undefined;
    const isGoogle = p?.name === Provider.GOOGLE_CLOUD;
    const isAWS    = p?.name === Provider.AWS;
    const googleOk = isGoogle
      && !!(p as GoogleProviderConfig).artifactRegistry
      && !!(p as GoogleProviderConfig).performance
      && !!(p as GoogleProviderConfig).region
      && !!(p as GoogleProviderConfig).zone
      && !!(p as GoogleProviderConfig).filestoreExportPath
      && !!(p as GoogleProviderConfig).mountOptions;
    const awsOk = isAWS
      && !!(p as AWSProviderConfig).artifactRegistry
      && !!(p as AWSProviderConfig).performance
      && !!(p as AWSProviderConfig).subnetId
      && Array.isArray((p as AWSProviderConfig).securityGroups)
      && (p as AWSProviderConfig).securityGroups!.length > 0
      && !!(p as AWSProviderConfig).filestoreExportPath
      && !!(p as AWSProviderConfig).mountOptions;
    const complete = (isGoogle && googleOk) || (isAWS && awsOk);

    // 3) Si complet, proposer de passer en revue
    if (complete) {
      console.log(chalk.green('✅ Configuration du provider déjà complète.'));
      const { review } = await prompts({
        type: 'confirm',
        name: 'review',
        message: 'Voulez-vous la passer en revue ?',
        initial: false
      });
      if (!review) {
        // On retourne tel quel, typé
        return (isGoogle
          ? (config as GoogleCliConfig)
          : (config as AWSCliConfig)
        );
      }
    }

    // 4) Sinon (ou si review), on reconstruit tout en reprenant existant
    const existingCommon: CommonConfig = {
      providerName: config.provider?.name,
      artifactRegistry: config.provider?.artifactRegistry,
      performance: config.provider?.performance,
    };
    const common = await promptCommonProviderConfig(existingCommon);

    let finalProvider: ProviderConfig;
    if (common.providerName === Provider.GOOGLE_CLOUD) {
      const base = config.provider as Partial<GoogleProviderConfig> || {};
      base.name = Provider.GOOGLE_CLOUD;
      base.artifactRegistry = common.artifactRegistry;
      base.performance = common.performance;
      const spec = await promptGoogleConfig(base);
      finalProvider = {
        ...base,
        region: spec.region,
        zone: spec.zone,
        filestoreExportPath: spec.filestoreExportPath,
        mountOptions: spec.mountOptions
      } as GoogleProviderConfig;
    } else {
      const base = config.provider as Partial<AWSProviderConfig> || {};
      base.name = Provider.AWS;
      base.artifactRegistry = common.artifactRegistry;
      base.performance = common.performance;
      const spec = await promptAWSConfig(base);
      finalProvider = {
        ...base,
        subnetId: spec.subnetId,
        securityGroups: spec.securityGroups,
        filestoreExportPath: spec.filestoreExportPath,
        mountOptions: spec.mountOptions
      } as AWSProviderConfig;
    }

    // 5) Écrire la config finale
    config.provider = finalProvider;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(chalk.green(`🔒 Configuration enregistrée dans ${configPath}`));

    // 6) Retourner typé
    return finalProvider.name === Provider.GOOGLE_CLOUD
      ? (config as GoogleCliConfig)
      : (config as AWSCliConfig);
  }
}  