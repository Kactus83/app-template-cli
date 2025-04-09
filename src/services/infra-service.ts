import chalk from "chalk";
import prompts from "prompts";
import { ConfigService } from "./config-service.js";
import { Provider, CliConfig } from "../config/cli-config.js";
import { GoogleInfraService } from "./providers/GoogleInfraService.js";
import { AwsInfraService } from "./providers/AwsInfraService.js";
import { IProviderInfraService } from "./providers/IProviderInfraService.js";

export class InfraService {
  /**
   * Sélectionne et retourne le service provider correspondant à la configuration CLI.
   * Si aucune configuration provider n'est présente, appelle d'abord ConfigService.ensureOrPromptConfig().
   *
   * @param config La configuration CLI.
   * @returns L'instance de IProviderInfraService correspondant.
   */
  static async getProviderService(config: CliConfig): Promise<IProviderInfraService> {
    if (!config.provider) {
      console.warn(chalk.yellow("Aucun provider configuré dans la configuration CLI."));
      config = await ConfigService.ensureOrPromptConfig();
    }
    if (config.provider!.name === Provider.GOOGLE_CLOUD) {
      return new GoogleInfraService();
    } else if (config.provider!.name === Provider.AWS) {
      return new AwsInfraService();
    } else {
      throw new Error("Provider inconnu.");
    }
  }

  /**
   * Orchestre la vérification et l'initialisation de l'infrastructure.
   * 
   * Processus :
   *   1. Récupération (et correction interactive si nécessaire) de la configuration CLI.
   *   2. Vérification de la configuration via verifyConfig() et correction interactive via correctConfig() si besoin.
   *   3. Vérification de l'infrastructure via verifyInfra().
   *   4. Proposition de provisionnement via initInfra() si l'infrastructure n'est pas accessible.
   *
   * En cas d'échec définitif, le déploiement est interrompu.
   */
  static async checkAndInitResources(): Promise<void> {
    // Récupérer et corriger la configuration CLI
    let config: CliConfig = await ConfigService.ensureOrPromptConfig();
    const providerService = await InfraService.getProviderService(config);

    // 1. Vérification de la configuration
    let configValid = await providerService.verifyConfig(config);
    if (!configValid) {
      console.log(chalk.yellow("La configuration semble incomplète ou invalide."));
      const response = await prompts({
        type: "confirm",
        name: "correct",
        message: "Voulez-vous corriger la configuration manquante pour ce provider ?",
        initial: true
      });
      if (response.correct) {
        config = await providerService.correctConfig(config);
      }
      configValid = await providerService.verifyConfig(config);
      if (!configValid) {
        console.error(chalk.red("La configuration est toujours invalide. Arrêt du déploiement."));
        process.exit(1);
      }
    }

    // 2. Vérification de l'infrastructure
    const infraOk = await providerService.verifyInfra(config);
    if (!infraOk) {
      console.log(chalk.yellow("L'infrastructure n'est pas entièrement accessible ou provisionnée."));
      const response = await prompts({
        type: "confirm",
        name: "init",
        message: "Voulez-vous provisionner les ressources manquantes via Terraform ?",
        initial: true
      });
      if (response.init) {
        await providerService.initInfra(config);
        if (!(await providerService.verifyInfra(config))) {
          console.error(chalk.red("L'infrastructure n'est toujours pas accessible après provisionnement. Arrêt du déploiement."));
          process.exit(1);
        }
      } else {
        console.error(chalk.red("Les ressources requises ne sont pas disponibles. Déploiement interrompu."));
        process.exit(1);
      }
    } else {
      console.log(chalk.green("Toutes les ressources critiques sont disponibles."));
    }
  }
}