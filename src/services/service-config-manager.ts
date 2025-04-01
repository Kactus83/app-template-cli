import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { DockerComposeService, Environment } from './docker-compose-service.js';
import { TemplateConfigService } from './template-config-service.js';
import { ServiceConfig, ExtendedServiceConfig } from '../config/template-config.js';

export class ServiceConfigManager {
  /**
   * Vérifie si le fichier de configuration du service existe et est conforme.
   * S'il est absent ou incomplet (à l'exception du champ healthCheck qui est récupéré depuis docker-compose),
   * cette fonction ne modifie que les clés manquantes et préserve toutes celles déjà présentes.
   * Le fichier est situé dans le contexte de build (déduit du docker-compose) et doit s'appeler `${serviceName}.yaml`.
   * Le fichier doit contenir obligatoirement le champ "order".
   *
   * @param serviceName Nom du service tel que défini dans le docker-compose.
   * @param env Environnement ('dev' ou 'prod').
   * @returns La configuration complète du service sous forme d'ExtendedServiceConfig.
   */
  static async checkConfigsAndRepair(serviceName: string, env: Environment): Promise<ExtendedServiceConfig> {
    const buildContext = await DockerComposeService.getServiceBuildContext(serviceName, env);
    const serviceConfigPath = path.join(buildContext, `${serviceName}.yaml`);
  
    // Lire la configuration existante depuis le fichier
    let config: Partial<ServiceConfig> & { order?: number } = {};
    if (await fs.pathExists(serviceConfigPath)) {
      try {
        const fileContents = await fs.readFile(serviceConfigPath, 'utf8');
        config = (yaml.load(fileContents) as Partial<ServiceConfig> & { order?: number }) || {};
        console.log(`Configuration trouvée pour ${serviceName}:`, config);
      } catch (error) {
        console.warn(`Erreur lors de la lecture de la config pour ${serviceName}: ${error}`);
      }
    }
  
    // On s'attend à ce que config.secrets soit déjà un tableau (grâce à la lecture du YAML)
    // Si ce n'est pas le cas, on utilise un tableau vide (mais le YAML de départ doit être conforme)
    const mergedSecrets: string[] = Array.isArray(config.secrets) ? config.secrets : [];
  
    // Compléter les valeurs manquantes
    const order = config.order ?? await DockerComposeService.getServiceOrder(serviceName, env);
    const healthCheck = await DockerComposeService.getServiceHealthCheck(serviceName, env);
  
    // Conserver toutes les propriétés déjà définies, sans les modifier, et construire l'objet de sortie
    const output: ExtendedServiceConfig = {
      name: serviceName,
      order: order,
      vaultRole: config.vaultRole ?? `${serviceName}-role`,
      prodAddress: config.prodAddress ?? "",
      healthCheck: healthCheck,
      secrets: mergedSecrets
    };
  
    // Écrire la configuration dans le fichier. La librairie yaml.dump respectera l'ordre d'insertion.
    await fs.writeFile(serviceConfigPath, yaml.dump(output));
    return output;
  }  

  /**
   * Charge la configuration d'un service à partir du fichier YAML situé dans le contexte de build.
   * Utilise checkConfigsAndRepair pour s'assurer que la configuration est présente et conforme.
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   * @returns La configuration complète du service ou null s'il n'est pas configuré.
   */
  static async loadServiceConfig(serviceName: string, env: Environment): Promise<ExtendedServiceConfig | null> {
    try {
      const config = await ServiceConfigManager.checkConfigsAndRepair(serviceName, env);
      return config;
    } catch (error) {
      console.warn(`Aucune configuration valide trouvée pour ${serviceName}: ${error}`);
      return null;
    }
  }

  /**
   * Liste l'ensemble des services définis dans le fichier docker-compose.(dev|prod).yml.
   * Pour chaque service présent dans le docker-compose, tente de charger et réparer le fichier de configuration
   * situé dans le contexte de build.
   * Retourne la liste des ExtendedServiceConfig triée par ordre croissant (champ "order").
   *
   * @param env Environnement ('dev' ou 'prod').
   * @returns La liste triée des configurations de service.
   */
  static async listServices(env: Environment): Promise<ExtendedServiceConfig[]> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceNames: string[] = Object.keys(composeData.services || {});
    const services: ExtendedServiceConfig[] = [];
    for (const serviceName of serviceNames) {
      try {
        const config = await ServiceConfigManager.loadServiceConfig(serviceName, env);
        if (config) {
          services.push(config);
        }
      } catch (error) {
        console.warn(`⚠️  Service '${serviceName}' ignoré: ${error}`);
      }
    }
    services.sort((a, b) => a.order - b.order);
    return services;
  }

  /**
   * Vérifie globalement la configuration du template et de tous les services définis dans le docker-compose.(dev|prod).yml.
   * Affiche des avertissements en cas de réparation.
   *
   * @param env Environnement ('dev' ou 'prod').
   */
  static async checkAllConfigs(env: Environment): Promise<void> {
    const templateConfig = await TemplateConfigService.checkTemplateConfig();
    console.log(`Template: ${templateConfig.name} - Version: ${templateConfig.version}`);
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      console.warn(`⚠️ Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
      return;
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceNames: string[] = Object.keys(composeData.services || {});
    for (const serviceName of serviceNames) {
      try {
        const serviceConfig = await ServiceConfigManager.checkConfigsAndRepair(serviceName, env);
        console.log(`Service '${serviceName}' (order: ${serviceConfig.order}) configuré avec prodAddress: ${serviceConfig.prodAddress}`);
      } catch (error) {
        console.warn(`⚠️  Erreur lors de la vérification du service '${serviceName}': ${error}`);
      }
    }
  }
}