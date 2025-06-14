import { execSync } from 'child_process';
import chalk from 'chalk';
import prompts from 'prompts';
import { TemplateConfigService } from './template-config-service.js';
import { DockerComposeService } from './docker-compose-service.js';

export class BuildService {
  /**
   * Exécute le prébuild puis le build des services en mode développement.
   */
  static async buildDev(): Promise<void> {
    // Récupération de la configuration du template
    const templateConfig = await TemplateConfigService.checkTemplateConfig();

    // Prébuild en mode dev (si défini)
    if (templateConfig.prebuildDevCommand) {
      console.log(chalk.blue(`Exécution du prébuild (dev) : ${templateConfig.prebuildDevCommand}`));
      try {
        execSync(templateConfig.prebuildDevCommand, { stdio: 'inherit' });
        console.log(chalk.green('Prébuild dev terminé avec succès.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du prébuild dev :'), error);
        process.exit(1);
      }
    }

    // Build en mode dev
    console.log(chalk.blue('Lancement du build en mode développement...'));
    try {
      execSync(templateConfig.buildDevCommand, { stdio: 'inherit' });
      console.log(chalk.green('Build en mode dev terminé avec succès.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build en mode dev :'), error);
      process.exit(1);
    }
  }

  /**
   * Exécute le prébuild puis le build des services en mode production.
   */
  static async buildProd(cliConfig: any): Promise<void> {
    // Vérification des noms d'images dans docker-compose.prod.yml
    const discrepancies = await DockerComposeService.checkImageNames(
      'prod',
      cliConfig.provider.artifactRegistry
    );
    if (discrepancies.length > 0) {
      console.log(chalk.yellow("Des écarts dans les noms d'images ont été détectés :"));
      discrepancies.forEach(d =>
        console.log(
          `- Service ${d.serviceName}: actuel = "${d.currentImage || 'non défini'}", attendu = "${d.expectedImage}"`
        )
      );
      const response = await prompts({
        type: 'confirm',
        name: 'fix',
        message: 'Voulez-vous corriger automatiquement ces noms d\'images selon les standards ?',
        initial: true
      });
      if (response.fix) {
        await DockerComposeService.correctImageNames('prod', cliConfig.provider.artifactRegistry);
      }
    }

    // Récupération de la configuration du template
    const templateConfig = await TemplateConfigService.checkTemplateConfig();

    // Prébuild en mode prod (si défini)
    if (templateConfig.prebuildProdCommand) {
      console.log(chalk.blue(`Exécution du prébuild (prod) : ${templateConfig.prebuildProdCommand}`));
      try {
        execSync(templateConfig.prebuildProdCommand, { stdio: 'inherit' });
        console.log(chalk.green('Prébuild prod terminé avec succès.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du prébuild prod :'), error);
        process.exit(1);
      }
    }

    // Build en mode prod
    console.log(chalk.blue('Lancement du build en mode production...'));
    try {
      execSync(templateConfig.buildProdCommand, { stdio: 'inherit' });
      console.log(chalk.green('Build en mode prod terminé avec succès.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build en mode prod :'), error);
      process.exit(1);
    }
  }
}