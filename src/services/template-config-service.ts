import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { TemplateConfig, defaultTemplateConfig } from '../types/template-config.js';

export class TemplateConfigService {
  private static readonly CONTAINERS_DIR = path.join(process.cwd(), 'containers');
  private static readonly TEMPLATE_FILE = path.join(TemplateConfigService.CONTAINERS_DIR, 'template.yaml');

  /**
   * Charge le fichier template.yaml.
   * @throws si introuvable.
   */
  static async loadTemplateConfig(): Promise<TemplateConfig> {
    if (!(await fs.pathExists(TemplateConfigService.TEMPLATE_FILE))) {
      throw new Error(`Fichier template.yaml introuvable dans ${TemplateConfigService.CONTAINERS_DIR}`);
    }
    const content = await fs.readFile(TemplateConfigService.TEMPLATE_FILE, 'utf8');
    return yaml.load(content) as TemplateConfig;
  }

  /**
   * Vérifie et répare (si besoin) la config template.yaml.
   * Crée le dossier `containers` et le fichier s'ils n'existent pas,
   * ou réécrit avec défauts si le contenu est invalide.
   */
  static async checkTemplateConfig(): Promise<TemplateConfig> {
    let repaired = false;
    let config: TemplateConfig;

    // 1) S'assure que le dossier containers existe
    await fs.ensureDir(TemplateConfigService.CONTAINERS_DIR);

    // 2) Si le fichier n'existe pas, on écrit la config par défaut
    if (!(await fs.pathExists(TemplateConfigService.TEMPLATE_FILE))) {
      console.warn('⚠️  template.yaml non trouvé, création depuis defaultTemplateConfig.');
      config = defaultTemplateConfig;
      await fs.writeFile(
        TemplateConfigService.TEMPLATE_FILE,
        yaml.dump(config),
        'utf8'
      );
      repaired = true;
    } else {
      // 3) Sinon on tente de charger et de valider
      try {
        const content = await fs.readFile(TemplateConfigService.TEMPLATE_FILE, 'utf8');
        config = yaml.load(content) as TemplateConfig;
        // Vérification basique
        const required = [
          'name', 'version', 'description',
          'prebuildDevCommand', 'prebuildProdCommand',
          'buildDevCommand', 'buildProdCommand',
          'runDevCommand', 'runProdCommand',
        ] as const;
        for (const key of required) {
          if (!config[key] || typeof config[key] !== 'string') {
            throw new Error(`Clé manquante ou invalide : ${key}`);
          }
        }
      } catch (err) {
        console.warn(`⚠️  Erreur de lecture/validation de template.yaml (${err}). Réparation.`);
        config = defaultTemplateConfig;
        await fs.writeFile(
          TemplateConfigService.TEMPLATE_FILE,
          yaml.dump(config),
          'utf8'
        );
        repaired = true;
      }
    }

    if (repaired) {
      console.warn('⚠️  La configuration du template a été réparée. Veuillez vérifier containers/template.yaml.');
    }

    return config;
  }
}
