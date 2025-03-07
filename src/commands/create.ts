import * as fs from 'fs-extra';
import { execSync } from 'child_process';
import * as path from 'path';
import prompts from 'prompts';
import { CliConfig } from '../config/cli-config';

/**
 * URL du dépôt contenant le template de projet.
 */
const TEMPLATE_REPO = 'https://github.com/Kactus83/app-template.git';

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
 * Vérifie si le répertoire cible (currentDir) contient des fichiers/dossiers autres que les éléments autorisés.
 *
 * @param targetDir - Chemin absolu du répertoire à vérifier.
 * @returns true si le répertoire est considéré "vide" (seulement éléments autorisés), false sinon.
 */
async function isDirectoryEmpty(targetDir: string): Promise<boolean> {
  const entries = await fs.readdir(targetDir);
  const filtered = entries.filter(entry => !ALLOWED_FILES.includes(entry));
  return filtered.length === 0;
}

/**
 * Propose à l'utilisateur d'utiliser le dossier courant pour créer le projet ou de spécifier un sous-dossier.
 *
 * @param currentDir - Chemin absolu du répertoire courant.
 * @returns Chemin absolu du répertoire dans lequel créer le projet.
 */
async function chooseTargetDirectory(currentDir: string): Promise<string> {
  // Si le répertoire courant est considéré vide, on l'utilise directement.
  if (await isDirectoryEmpty(currentDir)) {
    return currentDir;
  }
  
  // Le répertoire n'est pas vide (hors éléments autorisés)
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
 * Si un dépôt Git existe dans le dossier cible, propose de committer après création du projet.
 * Sinon, propose d'initialiser un dépôt Git.
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
 * @remarks
 * Cette commande effectue les étapes suivantes :
 * - Détermine le répertoire cible (dossier courant ou sous-dossier) à utiliser.
 * - Demande à l'utilisateur de saisir le nom du projet (par défaut, le nom du dossier cible).
 * - Clone le dépôt du template dans le répertoire cible.
 * - Supprime le dossier .git cloné pour rendre le projet indépendant.
 * - Crée le fichier de configuration `.app-template` contenant le nom du projet.
 * - Gère l'initialisation ou le commit dans le dépôt Git si nécessaire.
 *
 * @returns Promise<void> Une fois l'opération terminée.
 */
export async function createCommand(): Promise<void> {
  const currentDir = process.cwd();
  // Déterminer le répertoire cible
  const targetDir = await chooseTargetDirectory(currentDir);

  // Détecter le nom du projet par défaut : nom du dossier cible
  const defaultProjectName = path.basename(targetDir);
  const response = await prompts({
    type: 'text',
    name: 'projectName',
    message: '🚀 Quel est le nom de votre nouveau projet ?',
    initial: defaultProjectName,
    validate: (name: string) => name.trim() === '' ? 'Le nom du projet ne peut pas être vide.' : true,
  });

  if (!response.projectName) {
    console.log('❌ Opération annulée par l\'utilisateur.');
    return;
  }
  const projectName = response.projectName.trim();

  // Chemin du fichier de configuration
  const configFileName = '.app-template';
  const configPath = path.join(targetDir, configFileName);

  // Si un fichier de configuration existe déjà, on arrête
  if (await fs.pathExists(configPath)) {
    console.log(`⚠️  Un projet existe déjà dans ce dossier (fichier "${configFileName}" détecté).`);
    return;
  }

  // Clonage du dépôt template dans le répertoire cible
  console.log(`📥 Clonage du template depuis ${TEMPLATE_REPO} dans ${targetDir}...`);
  try {
    execSync(`git clone --depth=1 ${TEMPLATE_REPO} "${targetDir}"`, { stdio: 'inherit' });
    // Suppression du dossier .git cloné pour détacher l'historique du template
    await fs.remove(path.join(targetDir, '.git'));

    
    // Importer la configuration par défaut et mettre à jour le nom du projet
    import('../config/cli-config').then(({ defaultCliConfig }) => {
      const configContent: CliConfig = { ...defaultCliConfig, projectName };
      fs.writeFile(configPath, JSON.stringify(configContent, null, 2));

    console.log(`✅ Le projet "${projectName}" a été créé avec succès dans ${targetDir} !`);
    });

    // Gestion du dépôt Git
    await handleGitRepository(targetDir, projectName);

  } catch (error) {
    console.error('❌ Une erreur est survenue durant la création du projet :', error);
  }
}
