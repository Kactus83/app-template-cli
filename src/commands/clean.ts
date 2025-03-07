import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

/**
 * Commande interactive "clean" qui permet de nettoyer les conteneurs Docker.
 *
 * @remarks
 * Options proposées :
 * - Clean normal : exécute le nettoyage via docker-compose avec la variable CLEAN_ONLY=true.
 * - Clean forcé : exécute le nettoyage normal puis lance un nettoyage forcé (docker system prune et docker builder prune).
 * - Retour au menu principal.
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

  switch(response.option) {
    case 'normal':
      console.log(chalk.blue('[Clean normal]'));
      try {
        execSync('docker-compose run --rm -e CLEAN_ONLY=true deployments', { stdio: 'inherit' });
        console.log(chalk.green('Nettoyage normal terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
      }
      break;
    case 'forced':
      console.log(chalk.blue('[Clean forcé]'));
      try {
        execSync('docker-compose run --rm -e CLEAN_ONLY=true deployments', { stdio: 'inherit' });
        console.log(chalk.green('Nettoyage normal terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
      }
      console.log(chalk.blue('------------------------------------------------------'));
      console.log(chalk.blue('Exécution du nettoyage forcé Docker...'));
      console.log(chalk.blue('------------------------------------------------------'));
      try {
        execSync('docker system prune --all --force', { stdio: 'inherit' });
        execSync('docker builder prune --all --force', { stdio: 'inherit' });
        console.log(chalk.green('Nettoyage forcé terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage forcé:'), error);
      }
      break;
    case 'return':
    default:
      console.log(chalk.green('Retour au menu principal.'));
      break;
  }

  // Pause pour permettre à l'utilisateur de lire les résultats
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
