import { execSync } from 'child_process';
import axios from 'axios';
import chalk from 'chalk';
import prompts from 'prompts';
import { checkInternet, checkGit, checkRepo, checkDocker, checkDockerCompose } from './helpers';

/**
 * Commande "doctor" qui exécute un diagnostic complet en vérifiant les prérequis,
 * propose de tenter des correctifs automatiques pour certains problèmes, 
 * reteste après correctifs, et affiche un compte rendu final détaillé.
 *
 * @remarks
 * Pour Docker, si le test initial échoue, l'utilisateur peut choisir de tenter
 * un correctif automatique (exécution d'un "docker system prune"). Ensuite, le test est retesté.
 * Pour l'accès au dépôt GitHub, l'erreur est analysée pour fournir un détail.
 *
 * @returns Promise<void> Une fois le diagnostic et les éventuels correctifs terminés.
 *
 * @example
 * $ appwizard doctor
 *
 * @author
 * Kactus83
 */
export async function doctorCommand(): Promise<void> {
  console.clear();
  console.log(chalk.blue('🩺 Diagnostic avancé avec tentatives de correctifs automatiques...\n'));

  // --- Vérification initiale des prérequis ---
  const internetInitial = await checkInternet();
  const gitInitial = checkGit();
  let repoInitial = await checkRepo();
  let dockerInitial = checkDocker();
  let dockerComposeInitial = checkDockerCompose();

  // Analyse de l'accès au dépôt et récupération du détail en cas d'erreur
  let repoErrorDetail = '';
  if (!repoInitial) {
    try {
      await axios.get('https://github.com/Kactus83/app-template', { timeout: 5000 });
    } catch (err: any) {
      if (err.response && err.response.status) {
        repoErrorDetail = `HTTP status code: ${err.response.status}`;
      } else {
        repoErrorDetail = err.message;
      }
    }
  }

  console.log(chalk.blue('--- État initial ---'));
  console.log(`Connexion Internet : ${internetInitial ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Git                : ${gitInitial ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Accès au dépôt GitHub "app-template" : ${repoInitial ? chalk.green('OK') : chalk.red(`ÉCHEC (${repoErrorDetail})`)}`);
  console.log(`Docker             : ${dockerInitial ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker Compose     : ${dockerComposeInitial ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log('');

  // --- Tentatives de correctifs automatiques là où c'est envisageable ---

  // Pour Docker
  if (!dockerInitial) {
    console.log(chalk.red('❌ Docker n\'est pas disponible.'));
    const resDocker = await prompts({
      type: 'confirm',
      name: 'fixDocker',
      message: 'Voulez-vous tenter un correctif automatique pour Docker ?',
      initial: false,
    });
    if (resDocker.fixDocker) {
      try {
        console.log(chalk.blue('Tentative de correction automatique pour Docker...'));
        execSync('docker system prune --all --force', { stdio: 'inherit' });
      } catch (error) {
        console.error(chalk.red('Échec de la tentative de correction pour Docker.'));
      }
    }
  }

  // Pour GitHub (accès au dépôt) : pas de correctif automatique possible,
  // mais on invite l'utilisateur à vérifier sa connexion ou ses paramètres.
  if (!repoInitial) {
    console.log(chalk.red('❌ L\'accès au dépôt GitHub "app-template" a échoué.'));
    console.log(chalk.yellow('→ Vérifiez votre connexion, vos paramètres proxy ou l\'URL du dépôt.'));
  }

  // Pas de correctifs automatiques envisageables pour Internet, Git ou Docker Compose.
  if (!gitInitial) {
    console.log(chalk.red('❌ Git n\'est pas installé.'));
  }
  if (!dockerComposeInitial) {
    console.log(chalk.red('❌ Docker Compose n\'est pas installé.'));
  }

  // --- Re-test des prérequis après les tentatives de correctifs ---
  const internetFinal = await checkInternet();
  const gitFinal = checkGit();
  const repoFinal = await checkRepo();
  const dockerFinal = checkDocker();
  const dockerComposeFinal = checkDockerCompose();

  console.log(chalk.blue('\n--- État final après tentatives de correctifs ---'));
  console.log(`Connexion Internet : ${internetFinal ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Git                : ${gitFinal ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Accès au dépôt GitHub "app-template" : ${repoFinal ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker             : ${dockerFinal ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker Compose     : ${dockerComposeFinal ? chalk.green('OK') : chalk.red('ÉCHEC')}`);

  // --- Compte rendu final ---
  if (internetFinal && gitFinal && repoFinal && dockerFinal && dockerComposeFinal) {
    console.log(chalk.bold.green('\n🎉 Diagnostic avancé : Tous les prérequis sont satisfaits.'));
  } else {
    console.log(chalk.bold.red('\n❗ Diagnostic avancé : Certains prérequis ne sont toujours pas satisfaits.'));
    console.log(chalk.yellow('Veuillez suivre les conseils ci-dessus pour corriger les problèmes.'));
  }

  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
