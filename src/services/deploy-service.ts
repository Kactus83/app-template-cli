import { execSync } from 'child_process';
import chalk from 'chalk';
import { TemplateService } from './template-service.js';
import { ExtendedServiceConfig } from '../config/template-config.js';

/**
 * Service dédié au déploiement en production des services.
 * Le processus consiste à récupérer la liste des services et, pour chacun,
 * simuler le push de l'image vers le registry de production en utilisant l'adresse prodAddress.
 */
export class DeployService {
  static async deployAllServices(): Promise<void> {
    // Récupérer la liste des services configurés dans le template.
    const services: ExtendedServiceConfig[] = await TemplateService.listServices('prod');

    for (const service of services) {
      console.log(chalk.blue(`Déploiement du service : ${service.name} (order: ${service.order})`));
      try {
        // Simulation du push de l'image vers le registry de production.
        console.log(chalk.blue(`Pousser l'image de ${service.name} vers ${service.prodAddress}...`));
        // Ici, remplacer 'sleep 1' par l'appel effectif (par exemple, "docker push") le moment venu.
        execSync(`sleep 1`, { stdio: 'inherit' });
        console.log(chalk.green(`Image pour ${service.name} poussée avec succès vers ${service.prodAddress}.`));
      } catch (error) {
        console.error(chalk.red(`Erreur lors du push de l'image pour le service ${service.name}:`), error);
        throw error;
      }
    }
  }
}
