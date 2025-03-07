import * as fs from 'fs-extra';
import { execSync } from 'child_process';
import * as path from 'path';
import prompts from 'prompts';

/**
 * URL du dépôt contenant le template de projet.
 */
const TEMPLATE_REPO = 'https://github.com/Kactus83/app-template.git';

/**
 * Exécute la commande permettant de créer un nouveau projet à partir du template officiel.
 *
 * @remarks
 * Cette commande effectue les étapes suivantes :
 * - Vérifie que le dossier courant est vide.
 * - Demande à l'utilisateur de saisir le nom du projet.
 * - Clone le dépôt du template dans le dossier courant.
 * - Configure le projet en créant un fichier `.app-template`.
 *
 */
export async function createCommand(): Promise<void> {
  const currentDir = process.cwd();
  const configFileName = '.app-template';
  const configPath = path.join(currentDir, configFileName);

  // Vérification de l'existence d'un projet dans le dossier courant
  if (fs.existsSync(configPath)) {
    console.log(`⚠️  Un projet existe déjà dans ce dossier (fichier "${configFileName}" détecté).`);
    return;
  }

  // Vérification si le dossier courant est vide (bonne pratique recommandée)
  const files = fs.readdirSync(currentDir);
  if (files.length > 0) {
    console.log('⚠️  Le répertoire courant n\'est pas vide. Il est conseillé de démarrer dans un répertoire vide.');
    return;
  }

  // Demande interactive du nom de projet à l'utilisateur
  const response = await prompts({
    type: 'text',
    name: 'projectName',
    message: '🚀 Quel est le nom de votre nouveau projet ?',
    initial: 'mon-projet',
    validate: (name: string) => name.trim() === '' ? 'Le nom du projet ne peut pas être vide.' : true,
  });

  if (!response.projectName) {
    console.log('❌ Opération annulée par l\'utilisateur.');
    return;
  }

  // Début du clonage du dépôt template
  console.log(`📥 Clonage du template depuis ${TEMPLATE_REPO} en cours...`);
  try {
    execSync(`git clone --depth=1 ${TEMPLATE_REPO} "${currentDir}"`, { stdio: 'inherit' });

    // Suppression du dossier .git pour rendre indépendant le nouveau projet
    fs.removeSync(path.join(currentDir, '.git'));

    // Création du fichier de configuration personnalisé avec le nom du projet choisi
    const configContent = { projectName: response.projectName.trim() };
    fs.writeFileSync(configPath, JSON.stringify(configContent, null, 2));

    console.log(`✅ Le projet "${response.projectName}" a été créé avec succès !`);
  } catch (error) {
    console.error('❌ Une erreur est survenue durant la création du projet :', error);
  }
}
