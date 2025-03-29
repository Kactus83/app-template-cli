import prompts from 'prompts';
import chalk from 'chalk';
import { BuildService } from '../services/build-service.js';
import { performGlobalClean, forcedDockerClean } from '../services/clean-service.js';
import { SecretManagerService } from '../services/secret-manager-service.js';

/**
 * Commande interactive "build" qui propose plusieurs options de build.
 * L'utilisateur peut choisir de nettoyer l'environnement (normal ou forcé),
 * puis sélectionner l'environnement de build (développement ou production).
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

  // Options de nettoyage
  const cleanResponse = await prompts({
    type: 'select',
    name: 'option',
    message: 'Choisissez une option de nettoyage:',
    choices: [
      { title: '1. Build sans clean', value: 'noClean' },
      { title: '2. Build avec clean', value: 'clean' },
      { title: '3. Build avec clean forcé', value: 'forcedClean' },
      { title: '4. Retour', value: 'return' }
    ]
  });

  if (cleanResponse.option === 'return') {
    console.log(chalk.green('Retour au menu principal.'));
    return;
  }

  if (cleanResponse.option === 'clean') {
    console.log(chalk.blue('[Nettoyage standard]'));
    try {
      await performGlobalClean();
      console.log(chalk.green('Nettoyage standard terminé.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du nettoyage standard:'), error);
      return;
    }
  } else if (cleanResponse.option === 'forcedClean') {
    console.log(chalk.blue('[Nettoyage complet]'));
    try {
      await performGlobalClean();
      forcedDockerClean();
      console.log(chalk.green('Nettoyage complet terminé.'));
    } catch (error) {
      console.error(chalk.red('Erreur lors du nettoyage complet:'), error);
      return;
    }
  }

  // Demander à l'utilisateur dans quel environnement il souhaite builder
  const envResponse = await prompts({
    type: 'select',
    name: 'environment',
    message: 'Dans quel environnement souhaitez-vous builder votre projet ?',
    choices: [
      { title: 'Développement (dev)', value: 'dev' },
      { title: 'Production (prod)', value: 'prod' },
      { title: 'Annuler', value: 'cancel' }
    ]
  });

  if (envResponse.environment === 'cancel') {
    console.log(chalk.green('Build annulé.'));
    return;
  }

  // Vérification et correction des fichiers d'environnement avant le build
  const targetDir = process.cwd();
  const envValid = await SecretManagerService.checkEnvFiles(targetDir);
  if (!envValid) {
    console.error(chalk.red('Les fichiers .env.dev et/ou .env.prod sont incomplets.'));
    console.error(chalk.red('Les fichiers ont été automatiquement corrigés. Veuillez renseigner les valeurs manquantes, puis relancer le build.'));
    await SecretManagerService.repairEnvFiles(targetDir);
    process.exit(1);
  }

  // Lancer le build selon l'environnement choisi
  if (envResponse.environment === 'dev') {
    console.log(chalk.blue('Lancement du build en mode développement...'));
    await BuildService.buildDev();
  } else if (envResponse.environment === 'prod') {
    console.log(chalk.blue('Lancement du build en mode production...'));
    await BuildService.buildProd();
  }
}
