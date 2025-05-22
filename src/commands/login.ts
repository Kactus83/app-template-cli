/**
 * @module commands/login
 * Implémente la commande `appwizard login` :
 * - saisie manuelle,
 * - import de fichier JSON (sélection parmi ~/Downloads, filtré),
 * - ouverture du navigateur + import.
 */

import open from 'open';
import prompts from 'prompts';
import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import { AuthService } from '../services/auth-service.js';
import type { ServiceAccount } from '../types/auth.js';
import { ConfigService } from '../services/config-service.js';

export async function loginCommand(): Promise<void> {
  const auth   = new AuthService();
  const config = await new ConfigService().getConfig();
  const { frontendUrl } = config.endpoints;

  // 1) Choix du mode
  const modeResp = await prompts({
    type:    'select',
    name:    'mode',
    message: 'Mode de récupération des credentials Service Account :',
    choices: [
      { title: 'Manuel (saisie)',           value: 'manual' },
      { title: 'Fichier JSON (Downloads)',  value: 'file'   },
      { title: 'Via navigateur (download)', value: 'web'    },
    ],
    initial: 0,
  });
  const mode = (modeResp as any).mode as 'manual' | 'file' | 'web';

  let sa: ServiceAccount | undefined;

  // 2) Selon le mode, on récupère clientId/secret
  if (mode === 'manual') {
    // Saisie manuelle
    const resp = await prompts([
      { type: 'text',     name: 'clientId',     message: 'Client ID :'     },
      { type: 'password', name: 'clientSecret', message: 'Client Secret :' },
    ]);
    const clientId     = (resp as any).clientId as string | undefined;
    const clientSecret = (resp as any).clientSecret as string | undefined;
    if (!clientId || !clientSecret) {
      console.error('❌ Les deux champs sont requis.');
      return;
    }
    sa = { clientId, clientSecret };
  }
  else {
    // Mode file ou web
    if (mode === 'web') {
      console.log('🌐 Ouverture du navigateur pour créer votre Service Account…');
      await open(`${frontendUrl}/service-account-creation`);

      // Prompt pour attendre la création du Service Account
      const resp = await prompts({
        type:    'confirm',
        name:    'confirm',
        message: 'Avez-vous créé le Service Account ?',
        initial: true,
      });
      console.log('→ Une fois le JSON téléchargé, choisissez-le ci-dessous.');
    }

    const downloadDir = path.join(os.homedir(), 'Downloads');
    let files: string[] = [];
    try {
      files = (await fs.readdir(downloadDir))
        .filter(f => f.toLowerCase().endsWith('.json'));
    } catch {
      /* ignore */
    }

    // Séparer les JSON contenant "credential"
    const credFiles  = files.filter(f => f.toLowerCase().includes('credential'));
    const otherFiles = files.filter(f => !f.toLowerCase().includes('credential'));

    // Construire la liste de choix
    const choices: Array<{ title: string; value: string }> = [];

    // Priorité aux fichiers credentials*
    for (const f of credFiles) {
      choices.push({
        title: f,
        value: path.join(downloadDir, f)
      });
    }

    if (otherFiles.length > 0) {
      // Séparateur non sélectionnable
      choices.push({ title: '--- Autres JSON trouvés ---', value: '' });
      for (const f of otherFiles) {
        choices.push({
          title: f,
          value: path.join(downloadDir, f)
        });
      }
    }

    // Option manuelle en dernier
    choices.push({
      title: 'Entrer un chemin manuellement',
      value: '__manual'
    });

    // Prompt de sélection
    const sel = await prompts({
      type:    'select',
      name:    'choice',
      message: `Sélectionnez le fichier JSON dans ${downloadDir}:`,
      choices,
      initial: 0,
    });
    let filePath = (sel as any).choice as string | undefined;

    if (!filePath) {
      // Peut être le séparateur vide => fallback manuel
      const resp = await prompts({
        type:    'text',
        name:    'manual',
        message: 'Chemin complet vers le JSON :'
      });
      filePath = (resp as any).manual as string | undefined;
    } else if (filePath === '__manual') {
      // Choisi l’option manuelle
      const resp = await prompts({
        type:    'text',
        name:    'manual',
        message: 'Chemin complet vers le JSON :'
      });
      filePath = (resp as any).manual as string | undefined;
    }

    if (!filePath || !(await fs.pathExists(filePath))) {
      console.error('❌ Fichier introuvable ou chemin invalide.');
      return;
    }

    // Lecture et validation du JSON
    const json = await fs.readJSON(filePath) as any;
    if (!json.clientId || !json.clientSecret) {
      console.error('❌ Le JSON ne contient pas clientId/clientSecret.');
      return;
    }
    sa = {
      clientId:     json.clientId as string,
      clientSecret: json.clientSecret as string,
    };
  }

  // 3) Persistance et test du token
  if (sa) {
    await auth.setServiceAccount(sa);
    try {
      await auth.getAccessToken();
      console.log('🎉 Authentification réussie !');
    } catch (err: any) {
      console.error('❌ Impossible de récupérer le token :', err.message || err);
    }
  }
}
