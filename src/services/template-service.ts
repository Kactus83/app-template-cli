import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { TemplateConfig, defaultTemplateConfig, ServiceConfig, ServiceScript } from '../config/template-config.js';

/**
 * Interface pour l'affichage d'un service, qui étend ServiceConfig en ajoutant le nom du service.
 */
export interface DisplayServiceConfig extends ServiceConfig {
  name: string;
}

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
    // Si aucune info de build n'est trouvée, on suppose le dossier par défaut.
    return path.join(process.cwd(), 'containers', serviceName);
  }

  /**
   * Vérifie si le fichier de configuration du service existe et est conforme.
   * S'il est absent ou incomplet, il crée/répare le fichier avec des valeurs par défaut.
   * Le fichier est situé dans le contexte de build (déduit du docker-compose) et doit s'appeler `${serviceName}.yaml`.
   * @param serviceName Nom du service tel que défini dans le docker-compose.
   * @returns La configuration complète du service.
   */
  static async checkConfigsAndRepair(serviceName: string): Promise<ServiceConfig> {
    const buildContext = await TemplateService.getServiceBuildContext(serviceName);
    const serviceConfigPath = path.join(buildContext, `${serviceName}.yaml`);
    let config: Partial<ServiceConfig> = {};
    if (await fs.pathExists(serviceConfigPath)) {
      try {
        const fileContents = await fs.readFile(serviceConfigPath, 'utf8');
        config = yaml.load(fileContents) as Partial<ServiceConfig>;
      } catch (error) {
        console.warn(`Erreur lors de la lecture de la config pour ${serviceName}: ${error}`);
      }
    }
    // Définir des valeurs par défaut pour le service si elles sont manquantes.
    const defaultScript: ServiceScript = {
      dev: `echo "Commande dev pour ${serviceName} non définie"`,
      prod: `echo "Commande prod pour ${serviceName} non définie"`
    };
    const defaultServiceConfig: ServiceConfig = {
      prodAddress: config.prodAddress || "",
      vaultRole: config.vaultRole || `${serviceName}-role`,
      secrets: config.secrets || [],
      scripts: {
        build: (config.scripts && config.scripts.build) || {
          dev: `docker build -t ${serviceName}-dev ./containers/${serviceName}`,
          prod: `docker build -t ${serviceName}-prod ./containers/${serviceName}`
        },
        run: (config.scripts && config.scripts.run) || {
          dev: `docker-compose up ${serviceName}`,
          prod: `docker run -d ${serviceName}-prod`
        },
        deploy: (config.scripts && config.scripts.deploy) || {
          dev: defaultScript.dev,
          prod: `./deploy_${serviceName}.sh --prod`
        }
      }
    };
    // Écrire la configuration par défaut (ou réparée) dans le fichier de config.
    await fs.writeFile(serviceConfigPath, yaml.dump(defaultServiceConfig));
    return defaultServiceConfig;
  }

  /**
   * Charge la configuration d'un service à partir du fichier YAML situé dans le contexte de build.
   * Utilise checkConfigsAndRepair pour s'assurer que la configuration est présente et conforme.
   * @param serviceName Nom du service.
   * @returns La configuration complète du service ou null s'il n'est pas configuré.
   */
  static async loadServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
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
   * @returns La liste des configurations de service.
   */
  static async listServices(): Promise<DisplayServiceConfig[]> {
    const containersPath = path.join(process.cwd(), 'containers');
    const entries = await fs.readdir(containersPath);
    const services: DisplayServiceConfig[] = [];
    for (const entry of entries) {
      const serviceDir = path.join(containersPath, entry);
      const stats = await fs.stat(serviceDir);
      if (stats.isDirectory()) {
        try {
          const config = await TemplateService.loadServiceConfig(entry);
          if (config) {
            // Créer un objet DisplayServiceConfig en ajoutant "name" issu du nom du dossier
            services.push({ ...config, name: entry } as DisplayServiceConfig);
          }
        } catch (error) {
          // On ignore les dossiers qui ne possèdent pas de configuration.
        }
      }
    }
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
    // Vérifier la configuration du template.
    const templateConfig = await TemplateService.checkTemplateConfig();
    console.log(`Template: ${templateConfig.name} - Version: ${templateConfig.version}`);
    // Vérifier la configuration de tous les services.
    const containersPath = path.join(process.cwd(), 'containers');
    const entries = await fs.readdir(containersPath);
    for (const entry of entries) {
      const serviceDir = path.join(containersPath, entry);
      const stats = await fs.stat(serviceDir);
      if (stats.isDirectory()) {
        try {
          const serviceConfig = await TemplateService.checkConfigsAndRepair(entry);
          console.log(`Service '${entry}' configuré avec prodAddress: ${serviceConfig.prodAddress}`);
        } catch (error) {
          console.warn(`⚠️  Erreur lors de la vérification du service '${entry}': ${error}`);
        }
      }
    }
  }
}
