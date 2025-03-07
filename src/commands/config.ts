import * as fs from 'fs';
import * as path from 'path';

export function configCommand(): void {
  const configFileName = '.app-template';
  const configPath = path.resolve(process.cwd(), configFileName);

  if (!fs.existsSync(configPath)) {
    console.error(`Aucun fichier de configuration "${configFileName}" trouvé. Veuillez d'abord exécuter "appwizard create".`);
    return;
  }

  const configContent = fs.readFileSync(configPath, "utf8");
  try {
    const config = JSON.parse(configContent);
    console.log("Configuration actuelle :");
    console.log(JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Erreur lors de la lecture de la configuration :", error);
  }
}
