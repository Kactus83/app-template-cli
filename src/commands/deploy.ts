import prompts from 'prompts';
import chalk from 'chalk';
import { BuildService } from '../services/build-service.js';
import { DeployService } from '../services/deploy-service.js';
import { performGlobalClean, forcedDockerClean } from '../services/clean-service.js';

/**
 * Commande interactive "deploy" qui déploie le projet en production.
 * Le processus comprend :
 *  - Une confirmation de déploiement.
 *  - Une option pour effectuer un nettoyage complet de l'environnement.
 *  - Le build en mode production via BuildService.buildProd().
 *  - Le déploiement (push des images) pour chaque service via DeployService.deployAllServices().
 */
export async function deployCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('         Deploy Options (Prod)'));
  console.log(chalk.yellow('======================================'));

  // Confirmation de déploiement
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

  // Option de nettoyage complet
  const cleanResponse = await prompts({
    type: 'confirm',
    name: 'clean',
    message: 'Souhaitez-vous effectuer un nettoyage complet de l\'environnement avant le déploiement ?',
    initial: true,
  });

  if (cleanResponse.clean) {
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

  // Lancer le build en mode production
  console.log(chalk.blue('Lancement du build en mode production...'));
  try {
    await BuildService.buildProd();
    console.log(chalk.green('Build en mode production terminé avec succès.'));
  } catch (error) {
    console.error(chalk.red('Erreur lors du build en mode production:'), error);
    return;
  }

  // Déployer les services (push des images)
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
