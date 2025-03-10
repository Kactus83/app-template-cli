import fs from 'fs-extra';
import * as path from 'path';
import prompts from 'prompts';
import { execSync } from 'child_process';
import { CliConfig } from '../config/cli-config.js';
import { TemplateService, Template, Credential } from '../services/template-service.js';

// Pour ESM, définir __dirname
const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * Liste des fichiers/dossiers à exclure lors du test de "non-viduité" du répertoire.
 */
const ALLOWED_FILES = ['.git', '.vscode', '.DS_Store'];

/**
 * Nettoie le répertoire cible en supprimant tous les fichiers et dossiers
 * qui ne figurent pas dans la liste des éléments autorisés.
 *
 * @param targetDir - Chemin absolu du répertoire à nettoyer.
 */
async function cleanTargetDirectory(targetDir: string): Promise<void> {
  const entries = await fs.readdir(targetDir);
  for (const entry of entries) {
    if (!ALLOWED_FILES.includes(entry)) {
      await fs.remove(path.join(targetDir, entry));
    }
  }
}

/**
 * Vérifie si le répertoire cible contient des fichiers/dossiers autres que les éléments autorisés.
 *
 * @param targetDir - Chemin absolu du répertoire à vérifier.
 * @returns true si le répertoire est considéré "vide", false sinon.
 */
async function isDirectoryEmpty(targetDir: string): Promise<boolean> {
  const entries = await fs.readdir(targetDir);
  const filtered = entries.filter(entry => !ALLOWED_FILES.includes(entry));
  return filtered.length === 0;
}

/**
 * Propose à l'utilisateur d'utiliser le dossier courant ou de créer un sous-dossier pour le projet.
 *
 * @param currentDir - Chemin absolu du répertoire courant.
 * @returns Chemin absolu du répertoire cible.
 */
async function chooseTargetDirectory(currentDir: string): Promise<string> {
  if (await isDirectoryEmpty(currentDir)) {
    return currentDir;
  }
  
  const response = await prompts({
    type: 'select',
    name: 'choice',
    message: 'Le répertoire courant contient déjà des fichiers. Que souhaitez-vous faire ?',
    choices: [
      { title: `Utiliser le dossier courant (${path.basename(currentDir)}) et le nettoyer (sauf ${ALLOWED_FILES.join(', ')})`, value: 'useCurrent' },
      { title: 'Créer un sous-dossier pour le nouveau projet', value: 'createSubfolder' }
    ]
  });

  if (response.choice === 'useCurrent') {
    console.log(`\n⚠️  Le dossier courant (${currentDir}) sera nettoyé (sauf ${ALLOWED_FILES.join(', ')}) !`);
    const confirm = await prompts({
      type: 'confirm',
      name: 'ok',
      message: 'Confirmez-vous cette opération ?',
      initial: false,
    });
    if (confirm.ok) {
      await cleanTargetDirectory(currentDir);
      return currentDir;
    } else {
      console.log('Opération annulée. Veuillez relancer la commande.');
      process.exit(0);
    }
  } else {
    const responseFolder = await prompts({
      type: 'text',
      name: 'folderName',
      message: 'Entrez le nom du nouveau dossier à créer pour le projet :',
      initial: 'mon-projet'
    });
    if (!responseFolder.folderName.trim()) {
      console.log('❌ Le nom du dossier ne peut pas être vide.');
      process.exit(1);
    }
    const newFolderPath = path.join(currentDir, responseFolder.folderName.trim());
    if (await fs.pathExists(newFolderPath)) {
      console.log(`❌ Le dossier ${newFolderPath} existe déjà.`);
      process.exit(1);
    }
    await fs.mkdir(newFolderPath);
    return newFolderPath;
  }
}

/**
 * Gère l'initialisation ou le commit du dépôt Git dans le répertoire cible.
 *
 * @param targetDir - Chemin absolu du répertoire cible.
 * @param projectName - Nom du projet.
 */
async function handleGitRepository(targetDir: string, projectName: string): Promise<void> {
  const gitDir = path.join(targetDir, '.git');
  if (await fs.pathExists(gitDir)) {
    const response = await prompts({
      type: 'confirm',
      name: 'commit',
      message: 'Un dépôt Git a été détecté dans ce dossier. Voulez-vous committer la création du projet automatiquement ?',
      initial: false
    });
    if (response.commit) {
      try {
        execSync('git add .', { cwd: targetDir, stdio: 'inherit' });
        execSync(`git commit -m "Création du projet ${projectName}"`, { cwd: targetDir, stdio: 'inherit' });
        console.log('✅ Commit effectué.');
      } catch (error) {
        console.log('❌ Erreur lors du commit. Veuillez effectuer le commit manuellement.');
      }
    }
  } else {
    const response = await prompts({
      type: 'confirm',
      name: 'init',
      message: 'Aucun dépôt Git n\'a été détecté. Voulez-vous initialiser un dépôt Git dans ce dossier ?',
      initial: true
    });
    if (response.init) {
      try {
        execSync('git init', { cwd: targetDir, stdio: 'inherit' });
        execSync('git add .', { cwd: targetDir, stdio: 'inherit' });
        execSync(`git commit -m "Initialisation du projet ${projectName}"`, { cwd: targetDir, stdio: 'inherit' });
        console.log('✅ Dépôt Git initialisé et commit effectué.');
      } catch (error) {
        console.log('❌ Erreur lors de l\'initialisation du dépôt Git. Veuillez l\'initialiser manuellement.');
      }
    }
  }
}

/**
 * Commande "create" permettant de créer un nouveau projet à partir du template officiel.
 *
 * Cette commande effectue les étapes suivantes :
 * - Détermine le répertoire cible à utiliser.
 * - Demande à l'utilisateur de saisir le nom du projet.
 * - Demande à l'utilisateur son nom d'utilisateur et son mot de passe.
 *   (Ces informations seront enregistrées, mais pour le clonage, la clé privée par défaut incluse est toujours utilisée.)
 * - Récupère la liste des templates disponibles via le credential et propose un choix.
 * - Clone le template sélectionné dans le répertoire cible via TemplateService.
 * - Crée le fichier de configuration `.app-template` contenant le nom du projet.
 * - Gère l'initialisation ou le commit dans le dépôt Git si nécessaire.
 *
 * @returns Promise<void> Une fois l'opération terminée.
 */
export async function createCommand(): Promise<void> {
  const currentDir = process.cwd();
  const targetDir = await chooseTargetDirectory(currentDir);

  const defaultProjectName = path.basename(targetDir);
  const responseProject = await prompts({
    type: 'text',
    name: 'projectName',
    message: '🚀 Quel est le nom de votre nouveau projet ?',
    initial: defaultProjectName,
    validate: (name: string) => name.trim() === '' ? 'Le nom du projet ne peut pas être vide.' : true,
  });

  if (!responseProject.projectName) {
    console.log('❌ Opération annulée par l\'utilisateur.');
    return;
  }
  const projectName = responseProject.projectName.trim();

  const configFileName = '.app-template';
  const configPath = path.join(targetDir, configFileName);

  if (await fs.pathExists(configPath)) {
    console.log(`⚠️  Un projet existe déjà dans ce dossier (fichier "${configFileName}" détecté).`);
    return;
  }

  // Demande des credentials utilisateur
  let credential: Credential | undefined = await TemplateService.getCredential();
  if (!credential) {
    console.log('Aucun credential utilisateur n\'est enregistré.');
    const responseCred = await prompts([
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
    credential = { username: responseCred.username, password: responseCred.password };
    console.log('⚠️  Avertissement : Les credentials saisis seront enregistrés, mais le clonage utilisera la clé privée par défaut incluse dans le package.');
    await TemplateService.saveCredential(credential);
  }

  const templates: Template[] = await TemplateService.listTemplates(credential);
  const responseTemplate = await prompts({
    type: 'select',
    name: 'templateChoice',
    message: 'Sélectionnez le template à utiliser :',
    choices: templates.map((t: Template) => ({
      title: t.name,
      value: t,
    })),
    initial: 0,
  });

  const chosenTemplate: Template = responseTemplate.templateChoice;

  console.log(`📥 Clonage du template "${chosenTemplate.name}" dans ${targetDir}...`);
  try {
    await TemplateService.fetchTemplate(targetDir, chosenTemplate.url, credential);
    
    import('../config/cli-config.js').then(({ defaultCliConfig }) => {
      const configContent: CliConfig = { ...defaultCliConfig, projectName };
      fs.writeFile(configPath, JSON.stringify(configContent, null, 2))
        .then(() => console.log(`✅ Le projet "${projectName}" a été créé avec succès dans ${targetDir} !`))
        .catch(err => console.error('❌ Erreur lors de la création du fichier de configuration :', err));
    });

    await handleGitRepository(targetDir, projectName);
  } catch (error) {
    console.error('❌ Une erreur est survenue durant la création du projet :', error);
  }
}
