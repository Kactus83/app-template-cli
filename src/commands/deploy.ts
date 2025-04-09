import prompts from 'prompts';
import chalk from 'chalk';
import { BuildService } from '../services/build-service.js';
import { DeployService } from '../services/deploy-service.js';
import { performGlobalClean, forcedDockerClean } from '../services/clean-service.js';
import { InfraService } from '../services/infra-service.js';

export async function deployCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('         Deploy Options (Prod)'));
  console.log(chalk.yellow('======================================'));

  // 1. Confirmation de déploiement
  const confirmResponse = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Confirmez-vous le déploiement du projet en production ?',
    initial: false,
  });
  if (!confirmResponse.confirm) {
    console.log(chalk.green('Déploiement annulé.'));
    return;
  }

  // 2. Vérification préalable de la configuration et de l'infrastructure
  console.log(chalk.blue('Vérification de la configuration et de l\'infrastructure...'));
  try {
    await InfraService.checkAndInitResources();
    console.log(chalk.green('Configuration et infrastructure validées.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors de la vérification de la configuration/infrastructure:'), error);
    return;
  }

  // 3. Nettoyage
  
  console.log(chalk.blue('[Nettoyage complet]'));
  try {
    await performGlobalClean();
    forcedDockerClean();
    console.log(chalk.green('Nettoyage complet terminé.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors du nettoyage complet:'), error);
    return;
  }

  // 4. Lancement du build en mode production

  console.log(chalk.blue('Lancement du build en mode production...'));
  try {
    await BuildService.buildProd();
    console.log(chalk.green('Build en mode production terminé avec succès.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors du build en mode production:'), error);
    return;
  }

  // 5. Déploiement effectif : push des images et démarrage des containers
  console.log(chalk.blue('Déploiement des services en production (push des images) en cours...'));
  try {
    await DeployService.deployAllServices();
    console.log(chalk.green('Déploiement terminé avec succès.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors du déploiement:'), error);
  }

  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}