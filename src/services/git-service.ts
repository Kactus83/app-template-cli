import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';

/**
 * Service utilitaire pour les opérations Git.
 */
export class GitService {
  /**
   * Vérifie si Git est installé sur la machine.
   * @returns true si Git est installé, false sinon.
   */
  public static isGitInstalled(): boolean {
    try {
      execSync('git --version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Vérifie si le répertoire cible contient déjà un dépôt Git.
   * @param targetDir - Chemin absolu du répertoire.
   * @returns true si un dépôt Git est présent, false sinon.
   */
  public static async hasGitRepository(targetDir: string): Promise<boolean> {
    return fs.pathExists(path.join(targetDir, '.git'));
  }

  /**
   * Initialise un dépôt Git dans le répertoire cible et effectue un commit initial.
   * @param targetDir - Chemin absolu du répertoire.
   * @param message - Message du commit initial.
   */
  public static initRepository(targetDir: string, message: string): void {
    execSync('git init', { cwd: targetDir, stdio: 'inherit' });
    execSync('git add .', { cwd: targetDir, stdio: 'inherit' });
    execSync(`git commit -m "${message}"`, { cwd: targetDir, stdio: 'inherit' });
    console.log('✅ Dépôt Git initialisé et commit effectué.');
  }

  /**
   * Effectue un commit dans le dépôt Git existant du répertoire cible.
   * @param targetDir - Chemin absolu du répertoire.
   * @param message - Message du commit.
   */
  public static commitRepository(targetDir: string, message: string): void {
    try {
      execSync('git add .', { cwd: targetDir, stdio: 'inherit' });
      execSync(`git commit -m "${message}"`, { cwd: targetDir, stdio: 'inherit' });
      console.log('✅ Commit effectué.');
    } catch (error) {
      console.log('❌ Erreur lors du commit. Veuillez effectuer le commit manuellement.');
    }
  }

  /**
   * Gère l'ensemble des opérations Git lors de la création d'un projet.
   * Si un dépôt existe déjà, il propose de committer ; sinon, il propose de l'initialiser.
   * @param targetDir - Chemin absolu du répertoire cible.
   * @param projectName - Nom du projet.
   */
  public static async handleRepository(targetDir: string, projectName: string): Promise<void> {
    if (await this.hasGitRepository(targetDir)) {
      const response = await import('prompts').then(prompts =>
        prompts.default({
          type: 'confirm',
          name: 'commit',
          message: 'Un dépôt Git est déjà présent. Voulez-vous committer la création du projet automatiquement ?',
          initial: false,
        })
      );
      if (response.commit) {
        this.commitRepository(targetDir, `Création du projet ${projectName}`);
      }
    } else {
      const response = await import('prompts').then(prompts =>
        prompts.default({
          type: 'confirm',
          name: 'init',
          message: 'Aucun dépôt Git n\'a été détecté. Voulez-vous initialiser un dépôt Git dans ce dossier ?',
          initial: true,
        })
      );
      if (response.init) {
        this.initRepository(targetDir, `Initialisation du projet ${projectName}`);
      }
    }
  }
}
