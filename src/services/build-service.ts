import { execSync, spawnSync } from 'child_process';
import chalk from 'chalk';
import { TemplateConfigService } from './template-config-service.js';
import { DockerComposeService } from './docker-compose-service.js';
import prompts from 'prompts';
import path from 'path';

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
  static async buildProd(cliConfig: any): Promise<void> {
    
  // Vérification et correction des noms d'images dans docker-compose.prod.yml
  const discrepancies = await DockerComposeService.checkImageNames('prod', cliConfig.provider.artifactRegistry);
  if (discrepancies.length > 0) {
    console.log(chalk.yellow("Des écarts dans les noms d'images ont été détectés :"));
    discrepancies.forEach(d =>
      console.log(`- Service ${d.serviceName}: actuel = "${d.currentImage || 'non défini'}", attendu = "${d.expectedImage}"`)
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
    if (templateConfig.prebuildCommand) {
      console.log(chalk.blue(`Exécution du prébuild : ${templateConfig.prebuildCommand}`));

      try {
        const prebuildFile = path.resolve(process.cwd(), 'docker-compose.prebuild.yml');
        console.log(chalk.yellow(`→ Exécution du prébuild (docker-compose run --rm prebuild)…`));
        const res = spawnSync(
          'docker-compose',
          ['-f', prebuildFile, 'run', '--rm', 'prebuild'],
          { stdio: 'inherit' }
        );
        if (res.error || res.status !== 0) {
          throw new Error(`Échec du prébuild (code ${res.status || 'ERR'}).`);
        }
    
        console.log(chalk.green('✓ Prébuild terminé, types générés.'));
        } catch (error) {
          console.error(chalk.red('Erreur lors du build en mode prod :'), error);
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
