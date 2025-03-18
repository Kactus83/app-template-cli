import { execSync } from 'child_process';
import chalk from 'chalk';
import { TemplateService } from './template-service.js';
import { ExtendedServiceConfig } from '../config/template-config.js';

/**
 * Service dédié à l'exécution des commandes de build pour tous les services.
 * Les services sont récupérés via TemplateService.listServices(), qui retourne une liste triée par ordre.
 */
export class BuildService {
  /**
   * Exécute le build (en mode dev) de tous les services, dans l'ordre défini par leur champ "order".
   */
  static async buildAllServices(): Promise<void> {
    const services: ExtendedServiceConfig[] = await TemplateService.listServices();
    // Les services sont déjà triés par ordre croissant.
    for (const service of services) {
      console.log(chalk.blue(`Lancement du build pour le service: ${service.name} (order: ${service.order})`));
      try {
        execSync(service.scripts.build.dev, { stdio: 'inherit' });
        console.log(chalk.green(`Build terminé pour le service: ${service.name}`));
      } catch (error) {
        console.error(chalk.red(`Erreur lors du build pour le service ${service.name}:`), error);
      }
    }
  }
}
