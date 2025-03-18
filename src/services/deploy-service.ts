import { execSync } from 'child_process';
import chalk from 'chalk';
import { TemplateService } from './template-service.js';
import { ExtendedServiceConfig } from '../config/template-config.js';

/**
 * Service dédié au déploiement des services.
 */
export class DeployService {
  /**
   * Attend que le health check du service soit valide.
   * La commande healthCheck doit renvoyer 0 pour indiquer que le service est sain.
   * @param service Le service à vérifier.
   * @param timeout Temps maximum d'attente en ms (par défaut 30000 ms).
   * @param interval Intervalle entre les vérifications en ms (par défaut 2000 ms).
   */
  static async waitForHealthCheck(
    service: ExtendedServiceConfig,
    timeout = 30000,
    interval = 2000
  ): Promise<void> {
    const start = Date.now();
    while (true) {
      try {
        // Exécute la commande healthCheck récupérée depuis docker-compose.
        execSync(service.healthCheck, { stdio: 'ignore' });
        console.log(chalk.green(`Service ${service.name} est sain (health check validé).`));
        return;
      } catch (error) {
        if (Date.now() - start > timeout) {
          throw new Error(`Timeout: le service ${service.name} n'a pas validé son health check dans le délai imparti.`);
        }
        console.log(chalk.yellow(`Health check non valide pour ${service.name}. Nouvelle tentative dans ${interval} ms...`));
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }
  }

  /**
   * Déploie tous les services (en mode dev) dans l'ordre défini par le champ "order".
   * Pour chaque service, exécute la commande run, attend que son health check soit validé, puis passe au service suivant.
   */
  static async deployAllServices(): Promise<void> {
    const services: ExtendedServiceConfig[] = await TemplateService.listServices();
    for (const service of services) {
      console.log(chalk.blue(`Déploiement du service: ${service.name} (order: ${service.order})`));
      try {
        execSync(service.scripts.run.dev, { stdio: 'inherit' });
        await DeployService.waitForHealthCheck(service);
        console.log(chalk.green(`Service ${service.name} déployé avec succès.`));
      } catch (error) {
        console.error(chalk.red(`Erreur lors du déploiement du service ${service.name}:`), error);
        throw error;
      }
    }
  }
}
