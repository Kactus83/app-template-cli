import * as fs from 'fs-extra';
import { execSync } from 'child_process';
import * as path from 'path';

const TEMPLATE_REPO = 'https://github.com/Kactus83/app-template.git';

export function createCommand(): void {
  const currentDir = process.cwd();
  const configFileName = '.app-template';
  const configPath = path.join(currentDir, configFileName);

  // Vérifie si un projet existe déjà dans le dossier courant
  if (fs.existsSync(configPath)) {
    console.log(`⚠️  Un projet existe déjà ici (fichier "${configFileName}" trouvé).`);
    return;
  }

  // Vérifie si le dossier courant est vide (bonne pratique)
  const files = fs.readdirSync(currentDir);
  if (files.length > 0) {
    console.log('⚠️ Le répertoire courant n\'est pas vide. Il est recommandé d\'initialiser un nouveau projet dans un dossier vide.');
    return;
  }

  // Clonage du dépôt template directement dans le dossier courant
  console.log(`📥 Clonage du template depuis ${TEMPLATE_REPO}...`);
  try {
    execSync(`git clone --depth=1 ${TEMPLATE_REPO} "${currentDir}"`, { stdio: 'inherit' });
    // Suppression du dossier .git (historique du template non requis dans le nouveau projet)
    fs.removeSync(path.join(currentDir, '.git'));

    // Création du fichier de config par défaut
    const defaultConfig = { projectName: "app-template" };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log('✅ Projet créé avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors du clonage du template :', error);
  }
}
