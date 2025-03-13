import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

export interface TemplateConfig {
  name: string;
  version: string;
  description: string;
}

export interface ServiceConfig {
  name: string;
  prodAddress: string;
}

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
   * Charge la configuration d'un service à partir du fichier YAML situé dans le dossier de build.
   * Par exemple, pour le service "vault", le fichier doit se trouver dans le contexte de build et s'appeler vault.yaml.
   */
  static async loadServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
    const buildContext = await TemplateService.getServiceBuildContext(serviceName);
    const serviceConfigPath = path.join(buildContext, `${serviceName}.yaml`);
    if (await fs.pathExists(serviceConfigPath)) {
      const fileContents = await fs.readFile(serviceConfigPath, 'utf8');
      // On considère que le fichier YAML peut contenir éventuellement une propriété 'name'
      const data = yaml.load(fileContents) as Partial<ServiceConfig>;
      return {
        name: data.name ? data.name : serviceName,
        prodAddress: data.prodAddress || '',
      };
    }
    return null;
  }

  /**
   * Liste l'ensemble des services en scannant le dossier containers.
   * Pour chaque sous-dossier (correspondant à un service), tente de charger le fichier de configuration
   * depuis le contexte de build indiqué dans docker-compose.yml.
   */
  static async listServices(): Promise<ServiceConfig[]> {
    const containersPath = path.join(process.cwd(), 'containers');
    const entries = await fs.readdir(containersPath);
    const services: ServiceConfig[] = [];
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
          // On peut ignorer les dossiers qui n'ont pas de config ou ne sont pas définis dans docker-compose.
          // console.warn(`Aucune config trouvée pour ${entry}: ${error.message}`);
        }
      }
    }
    return services;
  }
}