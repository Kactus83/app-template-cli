import { execSync } from 'child_process';
import chalk from 'chalk';
import prompts from 'prompts';
import { checkInternet, checkGit, checkRepo, checkDocker, checkDockerCompose } from './helpers';

/**
 * Tente d'appliquer un correctif automatique pour Docker.
 *
 * @returns boolean True si le correctif a été appliqué avec succès, sinon false.
 */
function fixDocker(): boolean {
  try {
    console.log(chalk.blue('Tentative de correction automatique pour Docker...'));
    // Exemple de correctif automatique : exécuter un "docker system prune"
    execSync('docker system prune --all --force', { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(chalk.red('❌ Échec du correctif automatique pour Docker.'));
    return false;
  }
}

/**
 * Commande "doctor" qui exécute un diagnostic complet en utilisant les fonctions de test,
 * tente d'appliquer des correctifs automatiques pour certains problèmes, et retourne un compte rendu final.
 *
 * @returns Promise<void> Une fois le diagnostic et les éventuels correctifs terminés.
 */
export async function doctorCommand(): Promise<void> {
  console.clear();
  console.log(chalk.blue('🩺 Exécution du diagnostic avancé...\n'));
  
  const internet = await checkInternet();
  const git = checkGit();
  const repo = await checkRepo();
  const docker = checkDocker();
  const dockerCompose = checkDockerCompose();
  
  let correctionsApplied = false;
  
  if (!internet) {
    console.log(chalk.red('❌ Connexion Internet défaillante. Aucun correctif automatique disponible.'));
  }
  if (!git) {
    console.log(chalk.red('❌ Git n\'est pas installé. Veuillez l\'installer manuellement.'));
  }
  if (!repo) {
    console.log(chalk.red('❌ Accès au dépôt GitHub "app-template" impossible.'));
  }
  if (!docker) {
    console.log(chalk.red('❌ Docker n\'est pas disponible.'));
    const res = await prompts({
      type: 'confirm',
      name: 'fix',
      message: 'Voulez-vous tenter un correctif automatique pour Docker ?',
      initial: false,
    });
    if (res.fix) {
      if (fixDocker()) {
        console.log(chalk.green('✅ Correctif pour Docker appliqué.'));
        correctionsApplied = true;
      }
    }
  }
  if (!dockerCompose) {
    console.log(chalk.red('❌ Docker Compose n\'est pas installé. Veuillez l\'installer.'));
  }
  
  // Affichage du compte rendu final
  console.log('\n', chalk.bold.blue('📋 Compte rendu du diagnostic :'));
  console.log(`Connexion Internet : ${internet ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Git                : ${git ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Dépôt GitHub       : ${repo ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker             : ${docker ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker Compose     : ${dockerCompose ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  
  if (internet && git && repo && docker && dockerCompose) {
    console.log(chalk.bold.green('\n🎉 Diagnostic avancé : Tous les prérequis sont satisfaits.'));
  } else {
    console.log(chalk.bold.red('\n❗ Diagnostic avancé : Certains prérequis ne sont pas satisfaits.'));
    if (correctionsApplied) {
      console.log(chalk.green('\n✅ Des correctifs ont été appliqués automatiquement. Veuillez vérifier votre environnement.'));
    }
  }
  
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
