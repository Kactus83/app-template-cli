import prompts from 'prompts';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { TemplateService } from '../services/template-service.js';
import { BuildService } from '../services/build-service.js';
import { performGlobalClean, forcedDockerClean } from '../services/clean-service.js';

/**
 * Commande interactive "dev-run" qui lance les conteneurs Docker en mode développement.
 * L'utilisateur peut choisir de lancer directement le dev run ou d'effectuer un nettoyage et un build pré-run.
 */
export async function devRunCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Dev Run Options'));
  console.log(chalk.yellow('======================================'));

  // Récupération de la configuration du template (contenant notamment devRunCommand)
  const templateConfig = await TemplateService.checkTemplateConfig();

  // Demander à l'utilisateur s'il souhaite builder à nouveau avant de lancer le dev run
  const buildResponse = await prompts({
    type: 'confirm',
    name: 'buildAgain',
    message: 'Souhaitez-vous effectuer un build pré-run (avec nettoyage optionnel) avant de lancer le dev run ?',
    initial: false
  });

  if (buildResponse.buildAgain) {
    // Demander s'il souhaite nettoyer avant le build
    const cleanResponse = await prompts({
      type: 'confirm',
      name: 'clean',
      message: 'Souhaitez-vous effectuer un nettoyage de l\'environnement avant le build ?',
      initial: true
    });

    if (cleanResponse.clean) {
      // Choix du type de nettoyage
      const cleanTypeResponse = await prompts({
        type: 'select',
        name: 'cleanType',
        message: 'Quel type de nettoyage voulez-vous ?',
        choices: [
          { title: 'Light (nettoyage standard)', value: 'light' },
          { title: 'Intégral (nettoyage complet)', value: 'integral' }
        ]
      });
      if (cleanTypeResponse.cleanType === 'light') {
        console.log(chalk.blue('Exécution d\'un nettoyage standard...'));
        try {
          await performGlobalClean();
          console.log(chalk.green('Nettoyage standard terminé.'));
        } catch (error) {
          console.error(chalk.red('Erreur lors du nettoyage standard :'), error);
          return;
        }
      } else if (cleanTypeResponse.cleanType === 'integral') {
        console.log(chalk.blue('Exécution d\'un nettoyage complet...'));
        try {
          await performGlobalClean();
          forcedDockerClean();
          console.log(chalk.green('Nettoyage complet terminé.'));
        } catch (error) {
          console.error(chalk.red('Erreur lors du nettoyage complet :'), error);
          return;
        }
      }
    }

    // Lancer le build pré-run
    try {
      console.log(chalk.blue('Lancement du build pré-run...'));
      await BuildService.buildDev();
      console.log(chalk.green('Build pré-run terminé.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build pré-run :'), error);
      return;
    }
  }

  // Vérifier que la commande devRunCommand est définie dans le template
  if (!templateConfig.devRunCommand) {
    console.error(chalk.red('La commande devRunCommand n\'est pas définie dans le template.'));
    return;
  }

  // Lancer les conteneurs en mode développement
  try {
    console.log(chalk.blue(`Lancement des conteneurs en mode dev via : ${templateConfig.devRunCommand}`));
    execSync(templateConfig.devRunCommand, { stdio: 'inherit' });
  } catch (error) {
    console.error(chalk.red('Erreur lors du lancement des conteneurs en mode dev :'), error);
  }

  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
