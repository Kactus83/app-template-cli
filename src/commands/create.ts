import fs from 'fs-extra';
import * as path from 'path';
import prompts from 'prompts';
import { FetchTemplateService, Template } from '../services/fetch-template-service.js';
import { GitService } from '../services/git-service.js';
import { ConfigService } from '../services/config-service.js';
import { TemplateService } from '../services/template-service.js';
import { Credential, CredentialsService } from '../services/credentials-service.js';

// Pour ESM, définir __dirname
const __dirname = path.dirname(new URL(import.meta.url).pathname);

/**
 * Liste des fichiers/dossiers à conserver lors du nettoyage du répertoire.
 * On conserve .git, .vscode et .DS_Store afin de ne pas supprimer un dépôt Git existant (sauf si l'utilisateur choisit explicitement de le remplacer).
 */
const ALLOWED_FILES = ['.git', '.vscode', '.DS_Store'];

/**
 * Nettoie le répertoire cible en supprimant tous les fichiers et dossiers ne figurant pas dans ALLOWED_FILES.
 *
 * @param targetDir - Chemin absolu du répertoire à nettoyer.
 * @returns {Promise<void>}
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
 * Propose à l'utilisateur d'utiliser le dossier courant ou de créer un sous-dossier pour le projet.
 * Si le dossier courant est utilisé, les fichiers non essentiels seront supprimés, mais le dépôt Git existant sera conservé
 * si l'utilisateur ne choisit pas de le supprimer.
 *
 * @param currentDir - Chemin absolu du répertoire courant.
 * @returns {Promise<string>} Le chemin absolu du répertoire cible.
 */
async function chooseTargetDirectory(currentDir: string): Promise<string> {
  const response = await prompts({
    type: 'select',
    name: 'folderOption',
    message:
      'Voulez-vous utiliser le dossier courant ou créer un sous-dossier pour votre projet ?\n' +
      '(Si vous utilisez le dossier courant, tous les fichiers non essentiels seront supprimés.)',
    choices: [
      { title: 'Utiliser le dossier courant', value: 'current' },
      { title: 'Créer un sous-dossier', value: 'subfolder' },
    ],
    initial: 0,
  });

  if (response.folderOption === 'current') {
    console.log(`\n⚠️  Attention : Le dossier courant (${currentDir}) sera nettoyé (hors ${ALLOWED_FILES.join(', ')}) !`);
    // Si un dépôt Git est présent, proposer de le supprimer afin d'éviter les conflits lors de la copie.
    const gitPath = path.join(currentDir, '.git');
    if (await fs.pathExists(gitPath)) {
      const responseGit = await prompts({
        type: 'confirm',
        name: 'replaceGit',
        message: 'Un dépôt Git est présent dans ce dossier. Voulez-vous le supprimer pour cloner le template ?',
        initial: true,
      });
      if (responseGit.replaceGit) {
        await fs.remove(gitPath);
        console.log('🗑️  Le dépôt Git existant a été supprimé.');
      } else {
        console.log('👍 Le dépôt Git existant sera conservé.');
      }
    }
    await cleanTargetDirectory(currentDir);
    return currentDir;
  } else {
    const responseFolder = await prompts({
      type: 'text',
      name: 'folderName',
      message: 'Entrez le nom du sous-dossier à créer pour votre projet :',
      initial: 'mon-projet',
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
 * Commande "create" permettant de créer un nouveau projet à partir du template officiel.
 *
 * Le processus effectue les étapes suivantes :
 * - Détermine le répertoire cible (dossier courant ou sous-dossier).
 * - Demande le nom du projet.
 * - Demande les credentials utilisateur (nom d'utilisateur et mot de passe) qui sont enregistrés,
 *   bien que pour le clonage, la clé privée par défaut incluse dans le package soit utilisée.
 * - Propose le choix du template.
 * - Clone le template dans un dossier temporaire, puis copie son contenu dans le dossier cible.
 * - Écrit un fichier de configuration.
 * - Gère le dépôt Git via GitService (initialisation ou commit).
 *
 * @returns {Promise<void>}
 */
export async function createCommand(): Promise<void> {
  if (!GitService.isGitInstalled()) {
    console.log('❌ Git n\'est pas installé sur votre machine. Veuillez l\'installer avant de continuer.');
    process.exit(1);
  }

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

  // Gestion des credentials utilisateur
  let credential: Credential | undefined = await CredentialsService.getCredential();
  if (!credential) {
    console.log('Aucun credential utilisateur n\'est enregistré.');
    const responseCred = await prompts([
      {
        type: 'text',
        name: 'username',
        message: 'Entrez votre nom d\'utilisateur :',
        initial: 'test-user',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Entrez votre mot de passe :',
      },
    ]);
    credential = { username: responseCred.username, password: responseCred.password };
    console.log('⚠️  Avertissement : Les credentials saisis seront enregistrés, mais le clonage utilisera la clé privée par défaut incluse dans le package.');
    await CredentialsService.saveCredential(credential);
  }

  const templates: Template[] = await FetchTemplateService.listTemplates();
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
    await FetchTemplateService.fetchTemplate(targetDir, chosenTemplate.url);

    // Vérifier la validité des configurations du template.
    await TemplateService.checkAllConfigs();

    // Vérifier la validité de la configuration du projet (cli).
    await ConfigService.ensureOrUpdateConfig(targetDir, projectName);
    console.log(`✅ Le projet "${projectName}" a été créé avec succès dans ${targetDir} !`);

    // Créer ou mettre à jour le dépôt Git.
    await GitService.handleRepository(targetDir, projectName);
  } catch (error) {
    console.error('❌ Une erreur est survenue durant la création du projet :', error);
  }
}
