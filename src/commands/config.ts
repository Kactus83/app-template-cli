import * as fs from 'fs-extra';
import * as path from 'path';
import prompts from 'prompts';
import { CliConfig } from '../config/cli-config';

/**
 * Commande "config" interactive qui affiche et permet d'éditer la configuration du projet ligne par ligne.
 *
 * Le fichier de configuration est stocké dans ".app-template" dans le répertoire courant.
 * Chaque propriété de la configuration est traitée individuellement.
 *
 * @returns Promise<void>
 */
export async function configCommand(): Promise<void> {
  const configFileName = '.app-template';
  const configPath = path.resolve(process.cwd(), configFileName);

  if (!fs.existsSync(configPath)) {
    console.error(`Aucun fichier de configuration "${configFileName}" trouvé. Veuillez d'abord exécuter "appwizard create".`);
    return;
  }

  let config: CliConfig;
  try {
    const configContent = await fs.readFile(configPath, 'utf8');
    config = JSON.parse(configContent) as CliConfig;
  } catch (error) {
    console.error("Erreur lors de la lecture de la configuration :", error);
    return;
  }

  console.log("Configuration actuelle :");
  console.log(JSON.stringify(config, null, 2));

  // Modification explicite de chaque propriété pour éviter les problèmes de typage
  // Modifier projectName (string)
  const projectNameResp = await prompts({
    type: 'text',
    name: 'projectName',
    message: `Modifier "projectName" (actuel: ${config.projectName}) ? (laisser vide pour conserver la valeur)`,
    initial: config.projectName,
  });
  if (projectNameResp.projectName && projectNameResp.projectName.trim() !== '') {
    config.projectName = projectNameResp.projectName.trim();
  }

  // Modifier performTests (boolean)
  const performTestsResp = await prompts({
    type: 'toggle',
    name: 'performTests',
    message: `Modifier "performTests" (actuel: ${config.performTests}) ?`,
    initial: config.performTests,
    active: 'true',
    inactive: 'false'
  });
  config.performTests = performTestsResp.performTests;

  // Modifier performLint (boolean)
  const performLintResp = await prompts({
    type: 'toggle',
    name: 'performLint',
    message: `Modifier "performLint" (actuel: ${config.performLint}) ?`,
    initial: config.performLint,
    active: 'true',
    inactive: 'false'
  });
  config.performLint = performLintResp.performLint;

  // Modifier hotFrontend (boolean)
  const hotFrontendResp = await prompts({
    type: 'toggle',
    name: 'hotFrontend',
    message: `Modifier "hotFrontend" (actuel: ${config.hotFrontend}) ?`,
    initial: config.hotFrontend,
    active: 'true',
    inactive: 'false'
  });
  config.hotFrontend = hotFrontendResp.hotFrontend;

  // Modifier openWindow (boolean)
  const openWindowResp = await prompts({
    type: 'toggle',
    name: 'openWindow',
    message: `Modifier "openWindow" (actuel: ${config.openWindow}) ?`,
    initial: config.openWindow,
    active: 'true',
    inactive: 'false'
  });
  config.openWindow = openWindowResp.openWindow;

  console.log("Nouvelle configuration :");
  console.log(JSON.stringify(config, null, 2));

  const confirm = await prompts({
    type: 'confirm',
    name: 'ok',
    message: 'Confirmez-vous ces modifications ?',
    initial: true
  });

  if (confirm.ok) {
    try {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log("✅ Configuration mise à jour avec succès.");
    } catch (error) {
      console.error("Erreur lors de l'écriture de la configuration :", error);
    }
  } else {
    console.log("Modifications annulées.");
  }
}
