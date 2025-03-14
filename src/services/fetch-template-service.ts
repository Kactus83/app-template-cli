import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import { Credential, CredentialsService } from './credentials-service.js';

/**
 * Interface représentant un template.
 *
 * @property {string} name - Le nom du template.
 * @property {string} url - L'URL SSH du dépôt Git du template.
 */
export interface Template {
  name: string;
  url: string;
}

/**
 * Service de gestion des templates.
 *
 * Ce service assure :
 * - Le clonage d’un template depuis un dépôt Git privé via la clé privée par défaut incluse dans le package.
 * - L’enregistrement et la récupération des credentials utilisateur.
 * - La fourniture (fictive) d’une liste de templates disponibles.
 *
 * Pour le clonage, le service utilise toujours la clé privée par défaut, quelle que soient les valeurs saisies par l'utilisateur.
 */
export class FetchTemplateService {
  /** Le template par défaut utilisé actuellement. */
  public static DEFAULT_TEMPLATE: Template = {
    name: 'default',
    url: 'git@github.com:Kactus83/app-template.git',
  };

  /**
   * Renvoie la liste des templates disponibles.
   *
   * Pour cette version, seul le template par défaut est renvoyé.
   * Par la suite, on utilisera credentials service pour authentifier l'utilisateur et récupérer ses templates depuis le backend.
   * @returns {Promise<Template[]>} Un tableau de templates.
   */
  public static async listTemplates(): Promise<Template[]> {
    // Pour cette version, seul le template par défaut est renvoyé
    // Par la suite on utilisera credentials service pour authentifier l'user et récupérer ses templates depuis le backend
    return [FetchTemplateService.DEFAULT_TEMPLATE];
  }

  /**
   * Clone le template depuis le dépôt Git dans un dossier temporaire, puis copie les fichiers dans le dossier cible.
   * L'authentification se fait via la clé privée par défaut incluse dans le package.
   *
   * @param targetDir - Chemin absolu du répertoire cible où copier les fichiers.
   * @param repoUrl - L'URL du dépôt Git du template.
   * @returns {Promise<void>}
   * @throws Une erreur si le clonage ou la copie échoue.
   */
  public static async fetchTemplate(
    targetDir: string,
    repoUrl: string
  ): Promise<void> {

    // Récupérer le clef privée temporaire. Cela devrait etre remplacée par l'authentification de l'utilisateur à terme.
    const rawKeyPath = CredentialsService.DEFAULT_KEY_PATH;
    const fixedKeyPath = rawKeyPath.replace(/\\/g, '/');
    const quotedKeyPath = `"${fixedKeyPath}"`;

    // Vérifier que le fichier de clé privée existe
    if (!(await fs.pathExists(rawKeyPath))) {
      throw new Error(`Le fichier de clé privée par défaut n'existe pas au chemin: ${rawKeyPath}`);
    }

    const gitSshCommand = `ssh -i ${quotedKeyPath} -o StrictHostKeyChecking=no`;
    const env = { ...process.env, GIT_SSH_COMMAND: gitSshCommand };

    // Créer un dossier temporaire pour le clonage
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appwizard-'));
    try {
      console.log(`📥 Clonage du template depuis ${repoUrl} dans le dossier temporaire ${tmpDir}...`);
      execSync(`git clone --depth=1 ${repoUrl} "${tmpDir}"`, { stdio: 'inherit', env });
      console.log('✅ Clonage dans le dossier temporaire terminé.');

      // Supprimer le dossier .git du clone temporaire
      const gitFolder = path.join(tmpDir, '.git');
      if (await fs.pathExists(gitFolder)) {
        await fs.remove(gitFolder);
      }

      console.log(`📂 Copie des fichiers du dossier temporaire vers ${targetDir}...`);
      // Copier tous les fichiers du dossier temporaire dans targetDir
      await fs.copy(tmpDir, targetDir, { overwrite: true });
      console.log('✅ Copie terminée.');

      // Supprimer le dossier temporaire
      await fs.remove(tmpDir);
    } catch (error) {
      console.error('❌ Erreur lors du clonage ou de la copie du template :', error);
      throw new Error('Échec du clonage du template.');
    }
  }
}
