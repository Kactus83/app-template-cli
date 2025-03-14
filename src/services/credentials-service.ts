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
 * Service de gestion des templates.
 *
 * Ce service assure :
 * - Le clonage d’un template depuis un dépôt Git privé via la clé privée par défaut incluse dans le package.
 * - L’enregistrement et la récupération des credentials utilisateur.
 * - La fourniture (fictive) d’une liste de templates disponibles.
 *
 * Pour le clonage, le service utilise toujours la clé privée par défaut, quelle que soient les valeurs saisies par l'utilisateur.
 */
export class CredentialsService {

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
      await fs.writeFile(CredentialsService.CREDENTIAL_FILE, JSON.stringify(credential, null, 2));
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
    if (await fs.pathExists(CredentialsService.CREDENTIAL_FILE)) {
      const data = await fs.readFile(CredentialsService.CREDENTIAL_FILE, 'utf8');
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
}
