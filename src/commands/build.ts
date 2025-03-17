import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';
import { TemplateService } from '../services/template-service.js';
import { performGlobalClean, forcedDockerClean } from '../services/clean-service.js';

/**
 * Demande interactive pour lancer le service frontend après le build.
 */
async function runFrontendPrompt(): Promise<void> {
  console.clear();
  console.log(chalk.blue('------------------------------------------------------'));
  console.log(chalk.blue('Génération des types en cours...'));
  console.log(chalk.blue('------------------------------------------------------'));

  try {
    execSync('docker-compose run --rm --build blockchain-compile', { stdio: 'inherit' });
    console.log(chalk.green('Les types ont été générés avec succès.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors de la génération des types:'), error);
    return;
  }

  const response = await prompts({
    type: 'select',
    name: 'launchFrontend',
    message: 'Voulez-vous lancer le service FRONTEND ?',
    choices: [
      { title: 'Oui', value: true },
      { title: 'Non', value: false }
    ]
  });

  if (response.launchFrontend) {
    try {
      const frontendConfig = await TemplateService.loadServiceConfig('frontend');
      if (frontendConfig) {
        console.log(chalk.blue('Lancement du frontend...'));
        execSync(frontendConfig.scripts.run.dev, { stdio: 'inherit' });
      } else {
        console.warn(chalk.yellow('Aucune configuration trouvée pour le service frontend.'));
      }
    } catch (error) {
      console.error(chalk.red('Erreur lors du lancement du frontend:'), error);
    }
  }

  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}

/**
 * Commande interactive "build" qui propose plusieurs options de build.
 * - L'utilisateur peut choisir de nettoyer l'environnement avant le build (clean normal ou forcé).
 * - Ensuite, le CLI récupère la liste des services via TemplateService et exécute leur commande de build (version dev).
 * - Enfin, le CLI propose de lancer le service frontend.
 */
export async function buildCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Build Options'));
  console.log(chalk.yellow('======================================'));
  console.log('1. Build sans clean');
  console.log('2. Build avec clean');
  console.log('3. Build avec clean forcé');
  console.log('4. Retour');
  console.log('');

  const response = await prompts({
    type: 'select',
    name: 'option',
    message: 'Choisissez une option:',
    choices: [
      { title: '1. Build sans clean', value: 'noClean' },
      { title: '2. Build avec clean', value: 'clean' },
      { title: '3. Build avec clean forcé', value: 'forcedClean' },
      { title: '4. Retour', value: 'return' }
    ]
  });

  if (response.option === 'clean') {
    try {
      await performGlobalClean();
      console.log(chalk.green('Nettoyage normal terminé.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du nettoyage normal:'), error);
    }
  } else if (response.option === 'forcedClean') {
    try {
      await performGlobalClean();
      forcedDockerClean();
    } catch (error) {
      console.error(chalk.red('Erreur lors du nettoyage forcé:'), error);
    }
  } else if (response.option === 'return') {
    console.log(chalk.green('Retour au menu principal.'));
    return;
  }
  
  // Récupérer la liste des services via TemplateService.
  const services = await TemplateService.listServices();
  // Exécuter la commande de build (version dev) pour chaque service dans l'ordre.
  for (const service of services) {
    console.log(chalk.blue(`Lancement du build pour le service: ${service.name}`));
    try {
      execSync(service.scripts.build.dev, { stdio: 'inherit' });
      console.log(chalk.green(`Build terminé pour le service: ${service.name}`));
    } catch (error) {
      console.error(chalk.red(`Erreur lors du build pour le service ${service.name}:`), error);
    }
  }

  await runFrontendPrompt();
}
