import prompts from 'prompts';
import chalk from 'chalk';
import { execSync } from 'child_process';
import { BuildService } from '../services/build-service.js';
import { TemplateConfigService } from '../services/template-config-service.js';
import { CleanService } from '../services/clean-service.js';

/**
 * Commande interactive "dev-run" qui lance les conteneurs Docker en mode développement.
 * L'utilisateur peut choisir de lancer un nettoyage, un build pré-run, puis le run.
 */
export async function devRunCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Dev Run Options'));
  console.log(chalk.yellow('======================================'));

  // Chargement et validation de la configuration du template
  const templateConfig = await TemplateConfigService.checkTemplateConfig();

  // Demander si on souhaite un build pré-run
  const buildResponse = await prompts({
    type: 'confirm',
    name: 'buildAgain',
    message: 'Souhaitez-vous effectuer un build pré-run (avec nettoyage optionnel) avant de lancer le dev run ?',
    initial: false
  });

  if (buildResponse.buildAgain) {
    // Demander un nettoyage avant le build
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
          await CleanService.performGlobalClean();
          console.log(chalk.green('Nettoyage standard terminé.'));
        } catch (error) {
          console.error(chalk.red('Erreur lors du nettoyage standard :'), error);
          return;
        }
      } else if (cleanTypeResponse.cleanType === 'integral') {
        console.log(chalk.blue('Exécution d\'un nettoyage complet...'));
        try {
          await CleanService.fullClean();
          console.log(chalk.green('Nettoyage complet terminé.'));
        } catch (error) {
          console.error(chalk.red('Erreur lors du nettoyage complet :'), error);
          return;
        }
      }
    }

    // Lancement du build pré-run en mode dev
    try {
      console.log(chalk.blue('Lancement du build pré-run en dev...'));
      await BuildService.buildDev();
      console.log(chalk.green('Build pré-run terminé.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du build pré-run :'), error);
      return;
    }
  }

  // Vérification de la commande runDevCommand dans la config
  if (!templateConfig.runDevCommand) {
    console.error(chalk.red('La commande runDevCommand n\'est pas définie dans le template.'));
    return;
  }

  // Lancement des conteneurs en mode dev
  try {
    console.log(chalk.blue(`Lancement des conteneurs en mode dev via : ${templateConfig.runDevCommand}`));
    execSync(templateConfig.runDevCommand, { stdio: 'inherit' });
  } catch (error) {
    console.error(chalk.red('Erreur lors du lancement des conteneurs en mode dev :'), error);
  }

  // Pause finale pour l'utilisateur
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}