import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

/**
 * Demande interactive pour lancer le service frontend après le build.
 *
 * @remarks
 * Cette fonction lance d’abord la génération des types via le service "blockchain-compile".
 * Ensuite, elle propose à l'utilisateur de choisir si le frontend doit être lancé.
 *
 * @returns Une promesse résolue après exécution.
 */
async function runFrontendPrompt(): Promise<void> {
  console.clear();
  console.log(chalk.blue('------------------------------------------------------'));
  console.log(chalk.blue('Génération des types en cours...'));
  console.log(chalk.blue('------------------------------------------------------'));

  try {
    execSync('docker-compose run --rm --build blockchain-compile', { stdio: 'inherit' });
    console.log(chalk.green('Les types ont été générés avec succès.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors de la génération des types:'), error);
    return;
  }

  console.log('\nVoulez-vous lancer le service FRONTEND en plus ?');
  const response = await prompts({
    type: 'select',
    name: 'launchFrontend',
    message: 'Choisissez une option:',
    choices: [
      { title: 'Oui', value: true },
      { title: 'Non', value: false }
    ]
  });

  if (response.launchFrontend) {
    console.log(chalk.blue('------------------------------------------------------'));
    console.log(chalk.blue('Lancement du build avec le frontend...'));
    console.log(chalk.blue('Vous pouvez prendre le temps pour un café !'));
    console.log(chalk.blue('------------------------------------------------------'));
    try {
      execSync('docker-compose --profile frontend up --build', { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('Erreur lors du lancement du frontend:'), error);
    }
  } else {
    console.log(chalk.blue('------------------------------------------------------'));
    console.log(chalk.blue('Lancement du build sans le frontend...'));
    console.log(chalk.blue('Vous pouvez prendre le temps pour un café !'));
    console.log(chalk.blue('------------------------------------------------------'));
    try {
      execSync('docker-compose up --build', { stdio: 'inherit' });
    } catch (error) {
      console.error(chalk.red('Erreur lors du lancement du build sans frontend:'), error);
    }
  }

  // Pause pour laisser l'utilisateur lire les résultats
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}

/**
 * Commande interactive "build" qui propose plusieurs options de build.
 *
 * @remarks
 * Options proposées :
 * - Build sans clean
 * - Build avec clean
 * - Build avec nettoyage forcé (supprime images Docker et cache builder)
 * - Retour au menu principal
 *
 * Les options modifient des variables d'environnement pour être récupérées par Docker Compose.
 *
 * @returns Une promesse résolue une fois l'opération terminée.
 */
export async function buildCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Build Options'));
  console.log(chalk.yellow('======================================'));
  console.log('1. Build sans clean');
  console.log('2. Build et clean');
  console.log('3. Build et clean forcé (supprime images Docker et cache builder)');
  console.log('4. Retour');
  console.log('');

  const response = await prompts({
    type: 'select',
    name: 'option',
    message: 'Choisissez une option:',
    choices: [
      { title: '1. Build sans clean', value: 'noClean' },
      { title: '2. Build et clean', value: 'clean' },
      { title: '3. Build et clean forcé', value: 'forcedClean' },
      { title: '4. Retour', value: 'return' }
    ]
  });

  switch(response.option) {
    case 'noClean':
      console.log(chalk.blue('[Build sans clean]'));
      process.env.RESET_VAULT = "false";
      process.env.RESET_DATABASE = "false";
      await runFrontendPrompt();
      break;
    case 'clean':
      console.log(chalk.blue('[Build et clean]'));
      process.env.RESET_VAULT = "true";
      process.env.RESET_DATABASE = "true";
      await runFrontendPrompt();
      break;
    case 'forcedClean':
      console.log(chalk.blue('[Build et clean forcé]'));
      process.env.RESET_VAULT = "true";
      process.env.RESET_DATABASE = "true";
      console.log(chalk.blue('------------------------------------------------------'));
      console.log(chalk.blue('Êtes-vous sûr de vouloir effectuer un nettoyage forcé ?'));
      console.log(chalk.blue('La suite va être très longue !'));
      console.log(chalk.blue('------------------------------------------------------'));
      const confirm = await prompts({
        type: 'confirm',
        name: 'confirm',
        message: 'Choisissez [O/N]:',
        initial: false
      });
      if (confirm.confirm) {
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
        await runFrontendPrompt();
      } else {
        console.log(chalk.yellow('Nettoyage forcé annulé.'));
      }
      break;
    case 'return':
    default:
      console.log(chalk.green('Retour au menu principal.'));
      break;
  }
}
