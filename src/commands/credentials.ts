import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import prompts from 'prompts';

// Chemin du fichier de credentials utilisateur (doit être le même que dans le service)
const CREDENTIAL_FILE: string = path.join(os.homedir(), '.appwizard-credentials.json');

/**
 * Affiche les credentials enregistrés.
 * Le mot de passe est masqué pour plus de sécurité.
 */
async function viewCredentials(): Promise<void> {
  if (await fs.pathExists(CREDENTIAL_FILE)) {
    const data = await fs.readFile(CREDENTIAL_FILE, 'utf8');
    try {
      const creds = JSON.parse(data);
      console.log('🔑 Credentials enregistrés :');
      console.log(`   Nom d'utilisateur : ${creds.username}`);
      console.log(`   Mot de passe       : ${'*'.repeat(String(creds.password).length)}`);
    } catch (error) {
      console.error('❌ Erreur lors de la lecture des credentials :', error);
    }
  } else {
    console.log('ℹ️  Aucun credential n\'est actuellement enregistré.');
  }
}

/**
 * Demande à l'utilisateur d'ajouter de nouveaux credentials.
 */
async function addCredentials(): Promise<void> {
  const response = await prompts([
    {
      type: 'text',
      name: 'username',
      message: 'Entrez votre nom d\'utilisateur :',
      initial: 'test-user'
    },
    {
      type: 'password',
      name: 'password',
      message: 'Entrez votre mot de passe :'
    }
  ]);
  if (!response.username || !response.password) {
    console.log('❌ Les deux champs doivent être renseignés.');
    return;
  }
  await fs.writeFile(CREDENTIAL_FILE, JSON.stringify({ username: response.username, password: response.password }, null, 2));
  console.log('✅ Vos credentials ont été ajoutés avec succès.');
}

/**
 * Permet à l'utilisateur de modifier ses credentials.
 */
async function editCredentials(): Promise<void> {
  if (!(await fs.pathExists(CREDENTIAL_FILE))) {
    console.log('ℹ️  Aucun credential n\'est enregistré pour être modifié. Veuillez en ajouter un.');
    return;
  }
  console.log('🔄 Modification des credentials existants :');
  await addCredentials();
}

/**
 * Supprime les credentials enregistrés.
 */
async function removeCredentials(): Promise<void> {
  if (await fs.pathExists(CREDENTIAL_FILE)) {
    await fs.remove(CREDENTIAL_FILE);
    console.log('✅ Vos credentials ont été supprimés.');
  } else {
    console.log('ℹ️  Aucun credential n\'était enregistré.');
  }
}

/**
 * Commande "credentials" permettant à l'utilisateur de gérer ses credentials.
 * Si aucun credential n'est enregistré, l'option "Ajouter" est proposée.
 * Sinon, l'utilisateur peut choisir de voir, modifier ou supprimer ses credentials.
 */
export async function credentialsCommand(): Promise<void> {
  const exists = await fs.pathExists(CREDENTIAL_FILE);
  console.log('\n🔑 Gestion des credentials utilisateur\n');

  let choices;
  if (exists) {
    choices = [
      { title: 'Voir mes credentials', value: 'view' },
      { title: 'Modifier mes credentials', value: 'edit' },
      { title: 'Supprimer mes credentials', value: 'remove' },
      { title: 'Quitter', value: 'exit' },
    ];
    console.log('📝 Un credential est déjà enregistré.');
  } else {
    choices = [
      { title: 'Ajouter mes credentials', value: 'add' },
      { title: 'Quitter', value: 'exit' },
    ];
    console.log('ℹ️  Aucun credential n\'est enregistré.');
  }

  const response = await prompts({
    type: 'select',
    name: 'action',
    message: 'Que souhaitez-vous faire ?',
    choices,
    initial: 0,
  });

  switch (response.action) {
    case 'view':
      await viewCredentials();
      break;
    case 'add':
      await addCredentials();
      break;
    case 'edit':
      await editCredentials();
      break;
    case 'remove':
      await removeCredentials();
      break;
    default:
      console.log('👋 Opération annulée.');
      break;
  }
}
