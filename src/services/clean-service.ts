import fs from 'fs-extra';
import path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

export class CleanService {
  /**
   * Dossier de déploiement en fonction de NODE_ENV.
   */
  static DEPLOYMENTS_DIR: string =
    process.env.NODE_ENV === 'production'
      ? path.resolve(process.cwd(), './prod-deployments')
      : path.resolve(process.cwd(), './dev-deployments');

  /**
   * Liste des dossiers à nettoyer (chemins absolus).
   */
  static directoriesToClean: string[] = [
    path.join(CleanService.DEPLOYMENTS_DIR, 'vault'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'database', 'data'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'backend', 'migrations'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'web3'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'mailhog'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'backend', 'logs'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'backend', 'docs'),
    // Nettoyage des types générés dans les containers
    path.resolve(process.cwd(), 'containers', 'backend', 'src', 'domains', 'web3', 'modules', 'dynamic', 'models', 'types'),
    path.resolve(process.cwd(), 'containers', 'containers', 'blockchain', 'types'),
    path.resolve(process.cwd(), 'containers', 'frontend', 'src', 'app', 'core', 'web3', 'dynamic-types'),
  ];

  /**
   * Liste des fichiers de signalisation à supprimer.
   */
  static signalFilesToRemove: string[] = [
    path.join(CleanService.DEPLOYMENTS_DIR, 'reset_done'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'backend', 'server-started'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'backend', 'initialized'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'frontend', 'initialized'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'database', 'initialized'),
    path.join(CleanService.DEPLOYMENTS_DIR, 'vault', 'initialized'),
  ];

  /**
   * Vide le contenu d'un dossier sans supprimer le dossier lui-même.
   * @param dirPath Chemin du dossier à vider.
   */
  static async cleanDirectoryContents(dirPath: string): Promise<void> {
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
  static async removeFile(filePath: string): Promise<void> {
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      console.log(chalk.green(`Fichier supprimé: ${filePath}`));
    } else {
      console.log(chalk.yellow(`Fichier non trouvé: ${filePath}`));
    }
  }

  /**
   * Effectue le nettoyage global des dossiers et des fichiers de signalisation.
   */
  static async performGlobalClean(): Promise<void> {
    console.log(chalk.blue('Nettoyage des dossiers...'));
    for (const dir of CleanService.directoriesToClean) {
      await CleanService.cleanDirectoryContents(dir);
    }
    console.log(chalk.blue('Suppression des fichiers de signalisation...'));
    for (const file of CleanService.signalFilesToRemove) {
      await CleanService.removeFile(file);
    }
  }

  /**
   * Exécute le nettoyage forcé Docker via des commandes système.
   */
  static forcedDockerClean(): void {
    console.log(chalk.blue('------------------------------------------------------'));
    console.log(chalk.blue('Exécution du nettoyage forcé Docker...'));
    console.log(chalk.blue('------------------------------------------------------'));
    execSync('docker system prune --all --force', { stdio: 'inherit' });
    execSync('docker builder prune --all --force', { stdio: 'inherit' });
    console.log(chalk.green('Nettoyage forcé Docker terminé.'));
  }

  /**
   * Effectue un nettoyage complet en enchaînant le nettoyage global et le nettoyage Docker forcé.
   */
  static async fullClean(): Promise<void> {
    await CleanService.performGlobalClean();
    CleanService.forcedDockerClean();
  }
}