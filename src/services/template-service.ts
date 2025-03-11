import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';

/**
 * Retourne le chemin absolu par défaut vers la clé privée incluse dans le package.
 * Le chemin est nettoyé pour retirer tout caractère indésirable (par exemple, un slash initial sur Windows).
 *
 * @returns {string} Le chemin absolu vers la clé privée par défaut.
 */
function getDefaultKeyPath(): string {
  let p = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'secrets', 'deploy_key_auth_boilerplate');
  p = p.replace(/^[/\\]+/, '');
  return p;
}

/**
 * Interface représentant les informations de connexion utilisateur.
 *
 * @property {string} username - Le nom d'utilisateur.
 * @property {string} password - Le mot de passe.
 */
export interface Credential {
  username: string;
  password: string;
}

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
export class TemplateService {
  /** Le template par défaut utilisé actuellement. */
  public static DEFAULT_TEMPLATE: Template = {
    name: 'default',
    url: 'git@github.com:Kactus83/app-template.git',
  };

  /** Chemin vers le fichier de credentials utilisateur (stocké dans le dossier personnel). */
  private static CREDENTIAL_FILE: string = path.join(os.homedir(), '.appwizard-credentials.json');

  /** Chemin par défaut vers la clé privée incluse dans le package. */
  public static DEFAULT_KEY_PATH: string = getDefaultKeyPath();

  /**
   * Enregistre les credentials utilisateur dans le fichier de configuration.
   *
   * @param credential - Les credentials à enregistrer.
   * @returns {Promise<void>}
   * @throws Une erreur en cas d'échec d'écriture.
   */
  public static async saveCredential(credential: Credential): Promise<void> {
    try {
      await fs.writeFile(TemplateService.CREDENTIAL_FILE, JSON.stringify(credential, null, 2));
      console.log('✅ Credential utilisateur enregistré avec succès.');
    } catch (error) {
      console.error('❌ Erreur lors de l’enregistrement du credential utilisateur:', error);
      throw error;
    }
  }

  /**
   * Récupère les credentials utilisateur enregistrés.
   *
   * @returns {Promise<Credential | undefined>} Les credentials ou undefined s'ils n'existent pas.
   */
  public static async getCredential(): Promise<Credential | undefined> {
    if (await fs.pathExists(TemplateService.CREDENTIAL_FILE)) {
      const data = await fs.readFile(TemplateService.CREDENTIAL_FILE, 'utf8');
      try {
        const json = JSON.parse(data) as Credential;
        return json;
      } catch (error) {
        console.error('❌ Erreur lors de la lecture du fichier de credential utilisateur.', error);
        return undefined;
      }
    }
    return undefined;
  }

  /**
   * Renvoie la liste des templates disponibles.
   *
   * Pour cette version, seul le template par défaut est renvoyé.
   *
   * @param _credential - Les credentials utilisateur (non utilisés ici, mais réservés pour une évolution future).
   * @returns {Promise<Template[]>} Un tableau de templates.
   */
  public static async listTemplates(_credential: Credential): Promise<Template[]> {
    return [TemplateService.DEFAULT_TEMPLATE];
  }

  /**
   * Clone le template depuis le dépôt Git dans un dossier temporaire, puis copie les fichiers dans le dossier cible.
   * L'authentification se fait via la clé privée par défaut incluse dans le package.
   *
   * @param targetDir - Chemin absolu du répertoire cible où copier les fichiers.
   * @param repoUrl - L'URL du dépôt Git du template.
   * @param _credential - Les credentials utilisateur (non utilisés pour le clonage).
   * @returns {Promise<void>}
   * @throws Une erreur si le clonage ou la copie échoue.
   */
  public static async fetchTemplate(
    targetDir: string,
    repoUrl: string,
    _credential: Credential
  ): Promise<void> {
    const rawKeyPath = TemplateService.DEFAULT_KEY_PATH;
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
