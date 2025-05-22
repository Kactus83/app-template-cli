/**
 * @module commands/config
 * Commande `appwizard config` pour consulter et modifier
 * les sections encapsulées de la configuration CLI.
 */

import prompts from 'prompts';
import { ConfigService } from '../services/config-service.js';

export async function configCommand(): Promise<void> {
  const svc = new ConfigService();
  const cfg = await svc.getConfig();
  const eps = cfg.endpoints;

  console.log('\n⚙️  Configuration CLI actuelle :');
  console.log(`   endpoints.backendUrl : ${eps.backendUrl}`);
  console.log(`   endpoints.frontendUrl: ${eps.frontendUrl}\n`);

  // 1) Choix de la section
  const resp1 = (await prompts({
    type: 'select',
    name: 'section',
    message: 'Quelle section souhaitez-vous modifier ?',
    choices: [
      { title: 'endpoints (URLs)',             value: 'endpoints' },
      { title: 'Réinitialiser toute la config', value: 'reset'     },
      { title: 'Quitter',                       value: 'exit'      },
    ],
    initial: 0,
  })) as any;

  const section = resp1.section as 'endpoints' | 'reset' | 'exit';

  if (section === 'endpoints') {
    // 2) Modifier les URLs
    const resp2 = (await prompts([
      {
        type: 'text',
        name: 'backendUrl',
        message: 'Nouvelle URL backend :',
        initial: eps.backendUrl,
      },
      {
        type: 'text',
        name: 'frontendUrl',
        message: 'Nouvelle URL frontend :',
        initial: eps.frontendUrl,
      },
    ])) as any;

    const backendUrl  = resp2.backendUrl as string;
    const frontendUrl = resp2.frontendUrl as string;
    await svc.setEndpointsConfig({ backendUrl, frontendUrl });
    console.log('✅ Endpoints mis à jour.');
  }
  else if (section === 'reset') {
    await svc.clear();
    await svc.resetToDefault();
    console.log('⚠️  Config réinitialisée aux valeurs par défaut.');
  }
  else {
    console.log('👋 À bientôt !');
  }
}
