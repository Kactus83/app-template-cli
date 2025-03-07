import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';

function executeCommand(command: string) {
  console.log(`➡️ Exécution : ${command}`);
  try {
    execSync(command, { stdio: 'inherit' });
  } catch (error) {
    console.error(`❌ Erreur lors de l'exécution de : ${command}`);
    process.exit(1);
  }
}

async function updateCLI() {
  console.log("🚀 Démarrage de la mise à jour du CLI");

  // Compilation du projet
  console.log("🛠 Compilation du CLI...");
  executeCommand("npm run build");

  // Copier le dossier template local (PAS DE GIT!)
  const cliDir = path.resolve(__dirname, '..');
  const sourceTemplateDir = path.resolve(cliDir, '../template');
  const destinationTemplateDir = path.join(cliDir, 'app-template');

  console.log(`📂 Copie du dossier template local depuis ${sourceTemplateDir}...`);

  if (!fs.existsSync(sourceTemplateDir)) {
    console.error('❌ Le dossier template source est introuvable :', sourceTemplateDir);
    process.exit(1);
  }

  if (fs.existsSync(destinationTemplateDir)) {
    fs.removeSync(destinationTemplateDir);
  }

  fs.copySync(sourceTemplateDir, destinationTemplateDir);

  // Vérifier inclusion dans package.json
  console.log("📦 Vérification de l'inclusion du template dans npm...");
  const packageJsonPath = path.join(cliDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

  if (!packageJson.files) {
    packageJson.files = ["dist", "templates"];
  } else if (!packageJson.files.includes("templates")) {
    packageJson.files.push("templates");
  }

  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

  // Publication sur npm
  console.log("🚀 Publication sur npm...");
  executeCommand("npm publish");

  // Nettoyage du dossier templates après publication
  console.log("🧹 Nettoyage après publication...");
  fs.removeSync(destinationTemplateDir);

  console.log("✅ Mise à jour terminée avec succès !");
}

updateCLI();
