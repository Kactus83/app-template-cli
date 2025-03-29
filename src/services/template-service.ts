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
 * Type représentant l'environnement utilisé pour docker-compose.
 */
export type Environment = 'dev' | 'prod';

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
   * Retourne le nom du fichier docker-compose à utiliser selon l'environnement.
   */
  static getComposeFileName(env: Environment): string {
    return env === 'prod' ? 'docker-compose.prod.yml' : 'docker-compose.dev.yml';
  }

  /**
   * Récupère le contexte de build pour un service en lisant le fichier docker-compose.(dev|prod).yml.
   * Si le champ build est une chaîne, il est traité comme le contexte.
   * Sinon, s'il s'agit d'un objet, on utilise build.context.
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   */
  static async getServiceBuildContext(serviceName: string, env: Environment): Promise<string> {
    const composeFileName = TemplateService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans ${composeFileName}`);
    }
    if (typeof serviceDef.build === 'string') {
      return path.resolve(process.cwd(), serviceDef.build);
    } else if (typeof serviceDef.build === 'object' && serviceDef.build.context) {
      return path.resolve(process.cwd(), serviceDef.build.context);
    }
    return path.join(process.cwd(), 'containers', serviceName);
  }

  /**
   * Déduit l'ordre d'un service à partir du docker-compose.(dev|prod).yml en se basant sur l'ordre d'apparition des clés.
   * Cette fonction est utilisée si le champ "order" n'est pas défini dans la configuration du service.
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   * @returns Un nombre représentant l'ordre (commençant à 1).
   */
  static async getServiceOrder(serviceName: string, env: Environment): Promise<number> {
    const composeFileName = TemplateService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    const orderList: string[] = await deduceDeploymentOrder(composePath);
    const index = orderList.indexOf(serviceName);
    if (index === -1) {
      throw new Error(`Service '${serviceName}' non trouvé dans l'ordre déduit du ${composeFileName}.`);
    }
    return index + 1;
  }

  /**
   * Récupère le health check d'un service depuis le docker-compose.(dev|prod).yml.
   * On s'attend à ce que le champ healthcheck.test contienne la commande (souvent ["CMD", "/scripts/check_health.sh"]).
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   * @returns La commande de health check sous forme de chaîne.
   */
  static async getServiceHealthCheck(serviceName: string, env: Environment): Promise<string> {
    const composeFileName = TemplateService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans ${composeFileName}`);
    }
    if (serviceDef.healthcheck && serviceDef.healthcheck.test) {
      const test = serviceDef.healthcheck.test;
      if (Array.isArray(test)) {
        return test.join(' ');
      } else if (typeof test === 'string') {
        return test;
      }
    }
    throw new Error(`Le service '${serviceName}' ne possède pas de healthcheck défini dans ${composeFileName}`);
  }

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
    const buildContext = await TemplateService.getServiceBuildContext(serviceName, env);
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
    const order = config.order ?? await TemplateService.getServiceOrder(serviceName, env);
    const healthCheck = await TemplateService.getServiceHealthCheck(serviceName, env);
  
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
      const config = await TemplateService.checkConfigsAndRepair(serviceName, env);
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
    const composeFileName = TemplateService.getComposeFileName(env);
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
        const config = await TemplateService.loadServiceConfig(serviceName, env);
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
   * Vérifie la configuration du fichier template.yaml.
   * S'il n'existe pas ou est invalide, il est créé/réparé avec la configuration par défaut.
   *
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
   * Vérifie globalement la configuration du template et de tous les services définis dans le docker-compose.(dev|prod).yml.
   * Affiche des avertissements en cas de réparation.
   *
   * @param env Environnement ('dev' ou 'prod').
   */
  static async checkAllConfigs(env: Environment): Promise<void> {
    const templateConfig = await TemplateService.checkTemplateConfig();
    console.log(`Template: ${templateConfig.name} - Version: ${templateConfig.version}`);
    const composeFileName = TemplateService.getComposeFileName(env);
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
        const serviceConfig = await TemplateService.checkConfigsAndRepair(serviceName, env);
        console.log(`Service '${serviceName}' (order: ${serviceConfig.order}) configuré avec prodAddress: ${serviceConfig.prodAddress}`);
      } catch (error) {
        console.warn(`⚠️  Erreur lors de la vérification du service '${serviceName}': ${error}`);
      }
    }
  }
}
