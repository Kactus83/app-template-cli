import { execSync } from 'child_process';
import chalk from 'chalk';
import { DockerComposeService, Environment } from './docker-compose-service.js';
import { ServiceConfigManager } from './service-config-manager.js';
import { ExtendedServiceConfig } from '../config/template-config.js';

/**
 * Service pour lancer les containers un par un en production.
 * Ce service exécute les containers dans l'ordre défini et vérifie leur état via les healthchecks.
 * Les fonctionnalités supplémentaires (intégration avec Vault, gestion fine des logs, etc.) pourront être ajoutées ultérieurement.
 */
export class RunService {
  /**
   * Exécute les containers définis dans le docker-compose dans l'ordre.
   * Pour chaque service, lance le container et attend (simulé ici) que le service soit healthy.
   *
   * @param env Environnement ('dev' ou 'prod').
   */
  static async runContainers(env: Environment): Promise<void> {
    console.log(chalk.blue(`Démarrage de l'exécution des containers en ${env}...`));

    // Récupérer la liste ordonnée des services via ServiceConfigManager
    const services: ExtendedServiceConfig[] = await ServiceConfigManager.listServices(env);

    // Lancer les containers dans l'ordre
    for (const service of services) {
      console.log(chalk.blue(`Lancement du service ${service.name}...`));
      try {
        // Lancer le container pour le service via docker-compose
        // On suppose que docker-compose est configuré pour lancer un service spécifique
        execSync(`docker-compose up -d ${service.name}`, { stdio: 'inherit' });
        
        // TODO: Implémenter une vérification du healthcheck du service.
        // Par exemple, une boucle d'attente avec timeout interrogeant l'endpoint du healthcheck.
        console.log(chalk.blue(`Attente de la disponibilité du service ${service.name}...`));
        execSync(`sleep 5`, { stdio: 'inherit' });
        
        console.log(chalk.green(`Service ${service.name} lancé avec succès.`));
      } catch (error) {
        console.error(chalk.red(`Erreur lors du lancement du service ${service.name}:`), error);
        throw error;
      }
    }

    console.log(chalk.green(`Tous les services ont été lancés.`));
  }
}