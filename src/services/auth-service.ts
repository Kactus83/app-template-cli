import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import { mkdirp } from 'mkdirp';
import axios from 'axios';
import { ConfigService } from './config-service.js';
import type { EndpointsConfig } from '../types/cli-config.js';
import type { ServiceAccount, StoredServiceAccount } from '../types/auth.js';

const STORAGE_DIR = path.join(os.homedir(), '.appwizard');
const STORAGE_FILE = path.join(STORAGE_DIR, 'service-account.json');

export class AuthService {
  private data!: StoredServiceAccount;
  private config = new ConfigService();

  /** Charge ou initialise le fichier JSON de Service Account. */
  private async load(): Promise<void> {
    await mkdirp(STORAGE_DIR);
    if (await fs.pathExists(STORAGE_FILE)) {
      this.data = (await fs.readJSON(STORAGE_FILE)) as StoredServiceAccount;
    } else {
      this.data = {} as StoredServiceAccount;
    }
  }

  /** Sauvegarde `this.data` sur disque. */
  private async save(): Promise<void> {
    await fs.writeJSON(STORAGE_FILE, this.data, { spaces: 2 });
  }

  /**
   * Enregistre un Service Account, et purge le token cache.
   * @param sa Credentials du Service Account.
   */
  public async setServiceAccount(sa: ServiceAccount): Promise<void> {
    await this.load();
    this.data.clientId     = sa.clientId;
    this.data.clientSecret = sa.clientSecret;
    delete this.data.accessToken;
    delete this.data.expiresAt;
    await this.save();
    console.log('✅ Service Account enregistré.');
  }

  /**
   * Récupère le Service Account stocké.
   * @returns Les credentials, ou `undefined` s’ils n’existent pas.
   */
  public async getServiceAccount(): Promise<ServiceAccount|undefined> {
    await this.load();
    if (this.data.clientId && this.data.clientSecret) {
      return {
        clientId: this.data.clientId,
        clientSecret: this.data.clientSecret,
      };
    }
    return undefined;
  }

  /**
   * Renvoie un `access_token` valide.
   * Si un token en cache est encore valide (5s de marge), il est réutilisé ;
   * sinon, on en obtient un nouveau via client_credentials.
   * @throws si aucun Service Account n’est configuré.
   */
  public async getAccessToken(): Promise<string> {
    await this.load();

    const now = Date.now();
    if (
      this.data.accessToken &&
      this.data.expiresAt &&
      now < this.data.expiresAt - 5000
    ) {
      console.log(`🔄 Token cache valide (expire à ${new Date(this.data.expiresAt).toISOString()})`);
      return this.data.accessToken;
    }

    // On récupère les endpoints depuis la config
    const endpoints = (await this.config.getConfig()).endpoints as EndpointsConfig;
    const tokenUrl  = `${endpoints.backendUrl}/auth/services-accounts/token`;

    // Vérifications préalables
    if (!this.data.clientId || !this.data.clientSecret) {
      throw new Error('Aucun Service Account configuré. Lancez `appwizard login` d’abord.');
    }

    console.log(`🔑 Demande d’un nouveau token à : ${tokenUrl}`);
    const resp = await axios.post(tokenUrl, {
      clientId: this.data.clientId,
      clientSecret: this.data.clientSecret,
    });

    // Debug : vérifier la forme de la réponse
    console.log('🎁 Réponse token du backend :', resp.data);

    // Extraction correcte
    const accessToken = (resp.data as any).access_token as string|undefined;
    const expiresIn   = (resp.data as any).expires_in   as number|undefined;

    if (!accessToken || typeof expiresIn !== 'number') {
      throw new Error(`Réponse de token invalide : ${JSON.stringify(resp.data)}`);
    }

    // Mise en cache
    this.data.accessToken = accessToken;
    this.data.expiresAt   = now + expiresIn * 1000;
    await this.save();

    console.log(`🔄 Token récupéré et mis en cache (valide ${expiresIn}s).`);
    return accessToken;
  }

  /**
   * Supprime totalement le Service Account et le token cache.
   */
  public async clear(): Promise<void> {
    if (await fs.pathExists(STORAGE_FILE)) {
      await fs.remove(STORAGE_FILE);
      console.log('✅ Service Account supprimé.');
    } else {
      console.log('ℹ️  Aucun Service Account à supprimer.');
    }
  }
}
