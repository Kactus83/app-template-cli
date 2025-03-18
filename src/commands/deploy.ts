import prompts from 'prompts';
import chalk from 'chalk';
import { DeployService } from '../services/deploy-service.js';

/**
 * Commande interactive "deploy" qui déploie les services en mode dev.
 * Les services sont déployés dans l'ordre défini par leur champ "order" et le déploiement
 * d'un service n'est lancé qu'après la validation de son health check.
 *
 * @returns Promise<void>
 */
export async function deployCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('             Deploy Options'));
  console.log(chalk.yellow('======================================'));

  const response = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: 'Confirmez-vous le déploiement des services en mode dev ?',
    initial: true,
  });

  if (!response.confirm) {
    console.log(chalk.green('Déploiement annulé.'));
    return;
  }

  try {
    console.log(chalk.blue('Déploiement des services en cours...'));
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
