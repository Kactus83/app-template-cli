import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

// Détermine le dossier de déploiement selon l'environnement.
export const DEPLOYMENTS_DIR =
  process.env.NODE_ENV === 'production'
    ? path.resolve(process.cwd(), './prod-deployments')
    : path.resolve(process.cwd(), './dev-deployments');

// Mapping des dossiers à nettoyer (chemins sur l’hôte, relatifs à la racine du projet).
export const directoriesToClean: string[] = [
  path.join(DEPLOYMENTS_DIR, 'vault'),
  path.join(DEPLOYMENTS_DIR, 'database', 'data'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'migrations'),
  path.join(DEPLOYMENTS_DIR, 'web3'),
  path.join(DEPLOYMENTS_DIR, 'mailhog'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'logs'),
  path.join(DEPLOYMENTS_DIR, 'backend', 'docs'),
  // Cleaner les types générés dans els containers.
  path.resolve(process.cwd(), 'containers', 'backend', 'src', 'domains', 'web3', 'modules', 'dynamic', 'models', 'types'),
  path.resolve(process.cwd(), 'containers', 'containers', 'blockchain', 'types'),
  path.resolve(process.cwd(), 'containers', 'frontend', 'src', 'app', 'core', 'web3', 'dynamic-types')
];

// Mapping des fichiers de signalisation à supprimer.
export const signalFilesToRemove: string[] = [
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
export async function cleanDirectoryContents(dirPath: string): Promise<void> {
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
export async function removeFile(filePath: string): Promise<void> {
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
export async function performGlobalClean(): Promise<void> {
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
 * Exécute le nettoyage forcé Docker en utilisant des commandes system.
 */
export function forcedDockerClean(): void {
  console.log(chalk.blue('------------------------------------------------------'));
  console.log(chalk.blue('Exécution du nettoyage forcé Docker...'));
  console.log(chalk.blue('------------------------------------------------------'));
  execSync('docker system prune --all --force', { stdio: 'inherit' });
  execSync('docker builder prune --all --force', { stdio: 'inherit' });
  console.log(chalk.green('Nettoyage forcé Docker terminé.'));
}
