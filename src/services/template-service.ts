import { execSync } from 'child_process';
import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';

/**
 * Fonction utilitaire qui retourne le chemin absolu par défaut vers le fichier de clé privée.
 * Elle s'assure de retirer tout caractère indésirable au début du chemin (comme un slash ou backslash)
 * pour qu'il soit utilisable sur toutes les plateformes.
 *
 * @returns Le chemin absolu vers la clé privée par défaut.
 */
function getDefaultKeyPath(): string {
  // Calculer le chemin à partir du module actuel (dans dist/)
  let p = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'secrets', 'deploy_key_auth_boilerplate');
  // Sur Windows, new URL(import.meta.url).pathname peut commencer par un slash ou backslash. On le retire.
  p = p.replace(/^[/\\]+/, '');
  return p;
}

/**
 * Interface représentant un credential utilisateur.
 *
 * Ici, on demande un nom d'utilisateur et un mot de passe.
 */
export interface Credential {
  username: string;
  password: string;
}

/**
 * Interface représentant un template.
 */
export interface Template {
  name: string;
  url: string;
}

/**
 * Service de gestion des templates.
 *
 * Ce service gère :
 * - Le clonage d’un template depuis un dépôt Git privé via une deploy key.
 * - L’enregistrement et la récupération du credential utilisateur.
 * - La récupération (fictive) de la liste des templates disponibles.
 *
 * Pour le clonage, l'authentification s'effectue toujours via la clé privée par défaut
 * incluse dans le package, quelle que soient les valeurs saisies par l'utilisateur.
 */
export class TemplateService {
  /**
   * Le template par défaut.
   */
  public static DEFAULT_TEMPLATE: Template = {
    name: 'default',
    url: 'git@github.com:Kactus83/app-template.git',
  };

  /**
   * Chemin vers le fichier de credential dans le dossier de l'utilisateur.
   *
   * Le credential est stocké dans le répertoire personnel dans un fichier caché.
   */
  private static CREDENTIAL_FILE: string = path.join(os.homedir(), '.appwizard-credentials.json');

  /**
   * Chemin par défaut vers la clé privée incluse dans le package.
   */
  private static DEFAULT_KEY_PATH: string = getDefaultKeyPath();

  /**
   * Enregistre le credential utilisateur dans le fichier de configuration.
   *
   * @param credential - Le credential à enregistrer.
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
   * Récupère le credential utilisateur enregistré.
   *
   * @returns Le credential (de type Credential) ou undefined s'il n'est pas trouvé.
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
   * Pour cette version, elle renvoie uniquement le template par défaut.
   *
   * @param _credential - Le credential utilisateur (non utilisé ici, mais prévu pour évoluer).
   * @returns Un tableau de templates disponibles.
   */
  public static async listTemplates(_credential: Credential): Promise<Template[]> {
    return [TemplateService.DEFAULT_TEMPLATE];
  }

  /**
   * Clone le template depuis le dépôt Git dans le répertoire cible.
   *
   * L'authentification s'effectue via la clé privée par défaut incluse dans le package,
   * indépendamment des credentials utilisateur.
   *
   * @param targetDir - Chemin absolu du répertoire cible.
   * @param repoUrl - URL du dépôt Git du template.
   * @param _credential - Le credential utilisateur (non utilisé pour le clonage).
   * @throws Une erreur si le clonage ou le nettoyage échoue.
   */
  public static async fetchTemplate(
    targetDir: string,
    repoUrl: string,
    _credential: Credential
  ): Promise<void> {
    const rawKeyPath = TemplateService.DEFAULT_KEY_PATH;
    const fixedKeyPath = rawKeyPath.replace(/\\/g, '/');
    const quotedKeyPath = `"${fixedKeyPath}"`;

    // Vérifier que le fichier de clé existe
    if (!(await fs.pathExists(rawKeyPath))) {
      throw new Error(`Le fichier de clé privée par défaut n'existe pas au chemin: ${rawKeyPath}`);
    }

    const gitSshCommand = `ssh -i ${quotedKeyPath} -o StrictHostKeyChecking=no`;
    const env = { ...process.env, GIT_SSH_COMMAND: gitSshCommand };

    try {
      console.log(`📥 Clonage du template depuis ${repoUrl} dans ${targetDir}...`);
      execSync(`git clone --depth=1 ${repoUrl} "${targetDir}"`, { stdio: 'inherit', env });
      console.log('✅ Clonage terminé avec succès.');

      const gitFolder = path.join(targetDir, '.git');
      if (await fs.pathExists(gitFolder)) {
        console.log('🧹 Suppression du dossier .git du template cloné...');
        await fs.remove(gitFolder);
        console.log('✅ Dossier .git supprimé.');
      } else {
        console.warn('⚠️ Aucun dossier .git trouvé dans le répertoire cible.');
      }
    } catch (error) {
      console.error('❌ Erreur lors du clonage du template :', error);
      throw new Error('Échec du clonage du template.');
    }
  }
}
