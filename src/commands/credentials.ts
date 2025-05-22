/**
 * @module commands/credentials
 * Implémente la commande `appwizard credentials` :
 * consultation, renouvellement ou suppression du Service Account.
 */

import prompts from 'prompts';
import { AuthService } from '../services/auth-service.js';

export async function credentialsCommand(): Promise<void> {
  const auth = new AuthService();
  const sa = await auth.getServiceAccount();

  console.log('\n🔑 État du Service Account\n');
  if (!sa) {
    console.log('ℹ️  Aucun Service Account configuré. Lancez `appwizard login`.');
    return;
  }

  // Calcule le reste de validité du token en cache
  let remaining = 'inconnu';
  try {
    // @ts-ignore accéder à expiresAt interne
    await auth['load']();
    // @ts-ignore lire expiresAt
    const exp = auth['data'].expiresAt as number | undefined;
    if (exp) {
      const secs = Math.max(0, Math.round((exp - Date.now()) / 1000));
      remaining = `${secs}s`;
    }
  } catch {
    /* ignore */
  }

  console.log(`   clientId     : ${sa.clientId}`);
  console.log(`   token restant: ${remaining}\n`);

  // Prompt sans générique, on récupère resp via any
  const resp = (await prompts({
    type: 'select',
    name: 'action',
    message: 'Que souhaitez-vous faire ?',
    choices: [
      { title: 'Renouveler le token',            value: 'renew' },
      { title: 'Supprimer le Service Account',   value: 'clear' },
      { title: 'Quitter',                        value: 'exit' },
    ],
    initial: 0,
  })) as any;

  const action = resp.action as 'renew' | 'clear' | 'exit';

  if (action === 'renew') {
    try {
      await auth.getAccessToken();
      console.log('🔄 Token renouvelé avec succès.');
    } catch (e: any) {
      console.error('❌ Erreur pendant le renouvellement :', e.message || e);
    }
  }
  else if (action === 'clear') {
    await auth.clear();
  }
  else {
    console.log('👋 À bientôt !');
  }
}
