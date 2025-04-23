import prompts from 'prompts';
import chalk from 'chalk';
import { CleanService } from '../services/clean-service.js';

/**
 * Commande interactive "clean" qui permet de nettoyer l'environnement.
 * Options proposées :
 * - Clean normal : vide les dossiers et supprime les fichiers de signalisation.
 * - Clean forcé : réalise le clean normal puis effectue un nettoyage Docker forcé.
 * - Retour.
 *
 * @returns Une promesse résolue une fois l'opération terminée.
 */
export async function cleanCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Clean Options'));
  console.log(chalk.yellow('======================================'));
  console.log('1. Clean normal');
  console.log('2. Clean forcé (supprime images Docker et cache builder)');
  console.log('3. Retour');
  console.log('');

  const response = await prompts({
    type: 'select',
    name: 'option',
    message: 'Choisissez une option:',
    choices: [
      { title: '1. Clean normal', value: 'normal' },
      { title: '2. Clean forcé', value: 'forced' },
      { title: '3. Retour', value: 'return' }
    ]
  });

  switch (response.option) {
    case 'normal':
      console.log(chalk.blue('[Clean normal]'));
      try {
        console.log(chalk.yellow('Nettoyage normal en cours...'));
        await CleanService.performGlobalClean();
        console.log(chalk.green('Nettoyage normal terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
      }
      break;
    case 'forced':
      console.log(chalk.blue('[Clean forcé]'));
      try {
        console.log(chalk.yellow('Nettoyage normal en cours...'));
        await CleanService.performGlobalClean();
        console.log(chalk.green('Nettoyage normal terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
      }
      try {
        console.log(chalk.yellow('Nettoyage forcé Docker en cours...'));
        await CleanService.forcedDockerClean();
        console.log(chalk.green('Nettoyage forcé Docker terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage forcé Docker:'), error);
      }
      break;
    case 'return':
    default:
      console.log(chalk.green('Retour au menu principal.'));
      break;
  }

  // Pause pour laisser l'utilisateur lire les résultats.
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
