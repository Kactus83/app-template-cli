import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import {
  TemplateConfig,
  defaultTemplateConfig,
  ServiceConfig,
  ExtendedServiceConfig
} from '../config/template-config.js';
import { deduceDeploymentOrder } from '../utils/docker-compose-utils.js';

/**
 * Service permettant de charger la configuration du template et des services.
 */
export class TemplateService {
  /**
   * Charge le fichier template.yaml situé dans le dossier containers.
   */
  static async loadTemplateConfig(): Promise<TemplateConfig> {
    const templatePath = path.join(process.cwd(), 'containers', 'template.yaml');
    if (!(await fs.pathExists(templatePath))) {
      throw new Error(`Fichier template.yaml introuvable dans ${path.join(process.cwd(), 'containers')}`);
    }
    const fileContents = await fs.readFile(templatePath, 'utf8');
    const data = yaml.load(fileContents) as TemplateConfig;
    return data;
  }

  /**
   * Récupère le contexte de build pour un service en lisant le fichier docker-compose.yml.
   * Si le champ build est une chaîne, il est traité comme le contexte.
   * Sinon, s'il s'agit d'un objet, on utilise build.context.
   */
  static async getServiceBuildContext(serviceName: string): Promise<string> {
    const composePath = path.join(process.cwd(), 'docker-compose.yml');
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier docker-compose.yml introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans docker-compose.yml`);
    }
    if (typeof serviceDef.build === 'string') {
      return path.resolve(process.cwd(), serviceDef.build);
    } else if (typeof serviceDef.build === 'object' && serviceDef.build.context) {
      return path.resolve(process.cwd(), serviceDef.build.context);
    }
    return path.join(process.cwd(), 'containers', serviceName);
  }

  /**
   * Déduit l'ordre d'un service à partir du docker-compose en se basant sur l'ordre d'apparition des clés.
   * Cette fonction est utilisée si le champ "order" n'est pas défini dans la configuration du service.
   * @param serviceName Nom du service.
   * @returns Un nombre représentant l'ordre (commençant à 1).
   */
  static async getServiceOrder(serviceName: string): Promise<number> {
    const composePath = path.join(process.cwd(), 'docker-compose.yml');
    const orderList: string[] = await deduceDeploymentOrder(composePath);
    const index = orderList.indexOf(serviceName);
    if (index === -1) {
      throw new Error(`Service '${serviceName}' non trouvé dans l'ordre déduit du docker-compose.`);
    }
    return index + 1;
  }

  /**
   * Récupère le health check d'un service depuis le docker-compose.
   * On s'attend à ce que le champ healthcheck.test contienne la commande (souvent ["CMD", "/scripts/check_health.sh"]).
   * @param serviceName Nom du service.
   * @returns La commande de health check sous forme de chaîne.
   */
  static async getServiceHealthCheck(serviceName: string): Promise<string> {
    const composePath = path.join(process.cwd(), 'docker-compose.yml');
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier docker-compose.yml introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans docker-compose.yml`);
    }
    if (serviceDef.healthcheck && serviceDef.healthcheck.test) {
      const test = serviceDef.healthcheck.test;
      if (Array.isArray(test)) {
        return test.join(' ');
      } else if (typeof test === 'string') {
        return test;
      }
    }
    throw new Error(`Le service '${serviceName}' ne possède pas de healthcheck défini dans docker-compose.yml`);
  }

  /**
   * Vérifie si le fichier de configuration du service existe et est conforme.
   * S'il est absent ou incomplet (à l'exception du champ healthCheck qui est récupéré depuis docker-compose),
   * il crée/répare le fichier avec des valeurs par défaut.
   * Le fichier est situé dans le contexte de build (déduit du docker-compose) et doit s'appeler `${serviceName}.yaml`.
   * Le fichier doit contenir obligatoirement le champ "order".
   *
   * @param serviceName Nom du service tel que défini dans le docker-compose.
   * @returns La configuration complète du service sous forme d'ExtendedServiceConfig.
   */
  static async checkConfigsAndRepair(serviceName: string): Promise<ExtendedServiceConfig> {
    const buildContext = await TemplateService.getServiceBuildContext(serviceName);
    const serviceConfigPath = path.join(buildContext, `${serviceName}.yaml`);
    let config: Partial<ServiceConfig> & { order?: number } = {};
    if (await fs.pathExists(serviceConfigPath)) {
      try {
        const fileContents = await fs.readFile(serviceConfigPath, 'utf8');
        config = yaml.load(fileContents) as Partial<ServiceConfig> & { order?: number };
      } catch (error) {
        console.warn(`Erreur lors de la lecture de la config pour ${serviceName}: ${error}`);
      }
    }
    
    // Si le champ "order" n'est pas défini dans le YAML, le déduire depuis docker-compose.
    if (config.order === undefined || typeof config.order !== 'number') {
      config.order = await TemplateService.getServiceOrder(serviceName);
    }
    // Récupérer le health check depuis docker-compose.
    const healthCheck = await TemplateService.getServiceHealthCheck(serviceName);
    const defaultServiceConfig: ServiceConfig = {
      prodAddress: config.prodAddress || "",
      vaultRole: config.vaultRole || `${serviceName}-role`,
      secrets: config.secrets || [],
    };
    const extendedServiceConfig: ExtendedServiceConfig = {
      ...defaultServiceConfig,
      order: config.order as number,
      healthCheck: healthCheck,
      name: serviceName
    };
    await fs.writeFile(serviceConfigPath, yaml.dump(extendedServiceConfig));
    return extendedServiceConfig;
  }

  /**
   * Charge la configuration d'un service à partir du fichier YAML situé dans le contexte de build.
   * Utilise checkConfigsAndRepair pour s'assurer que la configuration est présente et conforme.
   * @param serviceName Nom du service.
   * @returns La configuration complète du service ou null s'il n'est pas configuré.
   */
  static async loadServiceConfig(serviceName: string): Promise<ExtendedServiceConfig | null> {
    try {
      const config = await TemplateService.checkConfigsAndRepair(serviceName);
      return config;
    } catch (error) {
      console.warn(`Aucune configuration valide trouvée pour ${serviceName}: ${error}`);
      return null;
    }
  }

  /**
   * Liste l'ensemble des services en scannant le dossier containers.
   * Pour chaque sous-dossier (correspondant à un service), tente de charger et réparer le fichier de configuration
   * depuis le contexte de build indiqué dans docker-compose.yml.
   * Retourne la liste des ExtendedServiceConfig triée par ordre croissant (champ "order").
   * @returns La liste triée des configurations de service.
   */
  static async listServices(): Promise<ExtendedServiceConfig[]> {
    const containersPath = path.join(process.cwd(), 'containers');
    const entries = await fs.readdir(containersPath);
    const services: ExtendedServiceConfig[] = [];
    for (const entry of entries) {
      const serviceDir = path.join(containersPath, entry);
      const stats = await fs.stat(serviceDir);
      if (stats.isDirectory()) {
        try {
          const config = await TemplateService.loadServiceConfig(entry);
          if (config) {
            services.push(config);
          }
        } catch (error) {
          console.warn(`⚠️  Service '${entry}' ignoré: ${error}`);
        }
      }
    }
    services.sort((a, b) => a.order - b.order);
    return services;
  }

  /**
   * Vérifie la configuration du fichier template.yaml.
   * S'il n'existe pas ou est invalide, il est créé/réparé avec la configuration par défaut.
   * @returns La configuration du template.
   */
  static async checkTemplateConfig(): Promise<TemplateConfig> {
    const templatePath = path.join(process.cwd(), 'containers', 'template.yaml');
    let repaired = false;
    let config: TemplateConfig;
    if (!(await fs.pathExists(templatePath))) {
      console.warn(`⚠️  Fichier template.yaml non trouvé. Création avec la configuration par défaut.`);
      config = defaultTemplateConfig;
      await fs.writeFile(templatePath, yaml.dump(config));
      repaired = true;
    } else {
      try {
        const fileContents = await fs.readFile(templatePath, 'utf8');
        config = yaml.load(fileContents) as TemplateConfig;
        if (!config.name || !config.version || !config.description) {
          throw new Error("Configuration incomplète.");
        }
      } catch (error) {
        console.warn(`⚠️  Erreur de lecture de template.yaml (${error}). Réparation avec la configuration par défaut.`);
        config = defaultTemplateConfig;
        await fs.writeFile(templatePath, yaml.dump(config));
        repaired = true;
      }
    }
    if (repaired) {
      console.warn("⚠️  La configuration du template a été réparée. Veuillez vérifier son contenu.");
    }
    return config;
  }

  /**
   * Vérifie globalement la configuration du template et de tous les services.
   * Affiche des avertissements en cas de réparation.
   */
  static async checkAllConfigs(): Promise<void> {
    const templateConfig = await TemplateService.checkTemplateConfig();
    console.log(`Template: ${templateConfig.name} - Version: ${templateConfig.version}`);
    const containersPath = path.join(process.cwd(), 'containers');
    const entries = await fs.readdir(containersPath);
    for (const entry of entries) {
      const serviceDir = path.join(containersPath, entry);
      const stats = await fs.stat(serviceDir);
      if (stats.isDirectory()) {
        try {
          const serviceConfig = await TemplateService.checkConfigsAndRepair(entry);
          console.log(`Service '${entry}' (order: ${serviceConfig.order}) configuré avec prodAddress: ${serviceConfig.prodAddress}`);
        } catch (error) {
          console.warn(`⚠️  Erreur lors de la vérification du service '${entry}': ${error}`);
        }
      }
    }
  }
}
