import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { TemplateConfig, defaultTemplateConfig } from '../config/template-config.js';

export class TemplateConfigService {
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
}