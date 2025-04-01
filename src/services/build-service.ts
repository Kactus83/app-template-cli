import { execSync } from 'child_process';
import chalk from 'chalk';
import { TemplateConfigService } from './template-config-service.js';

export class BuildService {
  /**
   * Exécute le prébuild (si défini dans le template) puis le build des services en mode développement.
   */
  static async buildDev(): Promise<void> {
    // Récupération de la configuration du template
    const templateConfig = await TemplateConfigService.checkTemplateConfig();
    if (templateConfig.prebuildCommand) {
      console.log(chalk.blue(`Exécution du prébuild : ${templateConfig.prebuildCommand}`));
      try {
        execSync(templateConfig.prebuildCommand, { stdio: 'inherit' });
        console.log(chalk.green('Prébuild terminé avec succès.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du prébuild :'), error);
        process.exit(1);
      }
    }

    // Lancement du build en mode développement via docker-compose.dev.yml
    console.log(chalk.blue('Lancement du build en mode développement...'));
    try {
      execSync('docker-compose -f docker-compose.dev.yml build', { stdio: 'inherit' });
      console.log(chalk.green('Build en mode dev terminé avec succès.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build en mode dev :'), error);
      process.exit(1);
    }
  }

  /**
   * Exécute le prébuild (si défini dans le template) puis le build des services en mode production.
   */
  static async buildProd(): Promise<void> {
    // Récupération de la configuration du template
    const templateConfig = await TemplateConfigService.checkTemplateConfig();
    if (templateConfig.prebuildCommand) {
      console.log(chalk.blue(`Exécution du prébuild : ${templateConfig.prebuildCommand}`));
      try {
        execSync(templateConfig.prebuildCommand, { stdio: 'inherit' });
        console.log(chalk.green('Prébuild terminé avec succès.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du prébuild :'), error);
        process.exit(1);
      }
    }

    // Lancement du build en mode production via docker-compose.prod.yml
    console.log(chalk.blue('Lancement du build en mode production...'));
    try {
      execSync('docker-compose -f docker-compose.prod.yml build', { stdio: 'inherit' });
      console.log(chalk.green('Build en mode prod terminé avec succès.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build en mode prod :'), error);
      process.exit(1);
    }
  }
}
