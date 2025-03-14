import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

// Détermine le dossier de déploiement selon l'environnement.
const DEPLOYMENTS_DIR =
  process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), '../prod-deployments')
    : path.resolve(process.cwd(), '../dev-deployments');

// Mapping des dossiers à nettoyer (chemins sur l’hôte, relatifs à la racine du projet).
const directoriesToClean: string[] = [
  path.join(DEPLOYMENTS_DIR, 'vault'),
  path.join(DEPLOYMENTS_DIR, 'database', 'data'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'migrations'),
  path.join(DEPLOYMENTS_DIR, 'web3'),
  path.join(DEPLOYMENTS_DIR, 'mailhog'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'logs'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'docs'),
  // Le dossier des types se trouve dans le projet lui-même (pas dans deployments)
  path.resolve(
    process.cwd(),
    'containers',
    'backend',
    'src',
    'domains',
    'web3',
    'modules',
    'dynamic',
    'models',
    'types'
  )
];

// Mapping des fichiers de signalisation à supprimer.
const signalFilesToRemove: string[] = [
  path.join(DEPLOYMENTS_DIR, 'reset_done'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'server-started'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'initialized'),
  path.join(DEPLOYMENTS_DIR, 'frontend', 'initialized'),
  path.join(DEPLOYMENTS_DIR, 'database', 'initialized'),
  path.join(DEPLOYMENTS_DIR, 'vault', 'initialized')
];

/**
 * Vide le contenu d'un dossier sans supprimer le dossier lui-même.
 * @param dirPath Chemin du dossier à vider.
 */
async function cleanDirectoryContents(dirPath: string): Promise<void> {
  if (await fs.pathExists(dirPath)) {
    await fs.emptyDir(dirPath);
    console.log(chalk.green(`Nettoyé: ${dirPath}`));
  } else {
    console.log(chalk.yellow(`Dossier non trouvé: ${dirPath}`));
  }
}

/**
 * Supprime un fichier s'il existe.
 * @param filePath Chemin du fichier à supprimer.
 */
async function removeFile(filePath: string): Promise<void> {
  if (await fs.pathExists(filePath)) {
    await fs.remove(filePath);
    console.log(chalk.green(`Fichier supprimé: ${filePath}`));
  } else {
    console.log(chalk.yellow(`Fichier non trouvé: ${filePath}`));
  }
}

/**
 * Exécute le nettoyage global en vidant les dossiers et en supprimant les fichiers de signalisation.
 */
async function performGlobalClean(): Promise<void> {
  console.log(chalk.blue('Nettoyage des dossiers...'));
  for (const dir of directoriesToClean) {
    await cleanDirectoryContents(dir);
  }
  console.log(chalk.blue('Suppression des fichiers de signalisation...'));
  for (const file of signalFilesToRemove) {
    await removeFile(file);
  }
}

/**
 * Commande interactive "clean" qui permet de nettoyer les conteneurs Docker.
 *
 * Options proposées :
 * - Clean normal : effectue le nettoyage en vidant les répertoires et en supprimant les fichiers de signalisation.
 * - Clean forcé : effectue le nettoyage normal puis lance un nettoyage forcé Docker (prune system et builder).
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

  switch (response.option) {
    case 'normal':
      console.log(chalk.blue('[Clean normal]'));
      try {
        await performGlobalClean();
        console.log(chalk.green('Nettoyage normal terminé.'));
      } catch (error) {
        console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
      }
      break;
    case 'forced':
      console.log(chalk.blue('[Clean forcé]'));
      try {
        await performGlobalClean();
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

  // Pause pour permettre à l'utilisateur de lire les résultats.
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
