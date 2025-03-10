import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';

export async function removeCredentials(): Promise<void> {
  const credentialFile = path.join(os.homedir(), '.appwizard-credentials.json');
  if (await fs.pathExists(credentialFile)) {
    await fs.remove(credentialFile);
    console.log('✅ Credentials supprimés.');
  } else {
    console.log('Aucun credential trouvé.');
  }
}
