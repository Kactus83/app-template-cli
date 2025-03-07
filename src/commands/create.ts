import * as fs from 'fs-extra';
import * as path from 'path';

export function createCommand(): void {
  const currentDir = process.cwd();
  const configFileName = '.app-template';
  const configPath = path.join(currentDir, configFileName);

  if (fs.existsSync(configPath)) {
    console.log(`⚠️  Un projet existe déjà ici (fichier "${configFileName}" trouvé).`);
    return;
  }

  const templateDir = path.join(__dirname, '../../app-template');

  if (!fs.existsSync(templateDir)) {
    console.error('❌ Le dossier template est introuvable dans le package CLI.');
    return;
  }

  console.log('📂 Copie des fichiers template dans le répertoire courant...');
  try {
    fs.copySync(templateDir, currentDir);
    const defaultConfig = { projectName: "app-template" };
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));

    console.log('✅ Projet créé avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de la copie du template :', error);
  }
}
