/**
 * @module services/config-service
 * Gère la lecture/écriture de ~/.appwizard
 */

import fs from 'fs-extra';
import * as path from 'path';
import type { CliConfig, EndpointsConfig, VersionConfig } from '../types/cli-config.js';

const CONFIG_FILE = '.appwizard';

export class ConfigService {
  private readonly configPath: string;
  private readonly defaultConfig: CliConfig = {
    endpoints: {
      backendUrl: 'https://ycgusiyjqf.eu-west-3.awsapprunner.com',
      frontendUrl: 'https://bjmr5kcium.eu-west-3.awsapprunner.com',
    },
    version: {
      backend:  '1.0.0',
      frontend: '1.0.0',
    },
  };

  constructor(private targetDir: string = process.cwd()) {
    this.configPath = path.join(this.targetDir, CONFIG_FILE);
  }

  /**
   * Lit la config, et applique les valeurs par défaut pour
   * les parties manquantes (endpoints ou version).
   */
  public async getConfig(): Promise<CliConfig> {
    let fileData: Partial<CliConfig> = {};
    if (await fs.pathExists(this.configPath)) {
      try {
        fileData = await fs.readJSON(this.configPath) as Partial<CliConfig>;
      } catch {
        // ignore malformed file
      }
    }
    const endpoints: EndpointsConfig = {
      ...this.defaultConfig.endpoints,
      ...(fileData.endpoints || {}),
    };
    const version: VersionConfig = {
      ...this.defaultConfig.version,
      ...(fileData.version || {}),
    };
    return { endpoints, version };
  }

  /**
   * Met à jour uniquement la section `endpoints`, en
   * conservant la version existante (ou la valeur par défaut).
   */
  public async setEndpointsConfig(endpoints: EndpointsConfig): Promise<void> {
    let fileData: Partial<CliConfig> = {};
    if (await fs.pathExists(this.configPath)) {
      try {
        fileData = await fs.readJSON(this.configPath) as Partial<CliConfig>;
      } catch { }
    }
    const version = fileData.version || this.defaultConfig.version;
    const newConfig: CliConfig = { endpoints, version };
    await fs.writeJSON(this.configPath, newConfig, { spaces: 2 });
    console.log('✅ Endpoints mis à jour dans', this.configPath);
  }

  /**
   * Supprime le fichier de configuration.
   * Utilisé pour réinitialiser la config.
   */
  public async clear(): Promise<void> {
      await fs.remove(this.configPath);
      console.log('⚠️  Configuration supprimée.');
  }

  /**
   * Réinitialise la configuration aux valeurs par défaut.
   * Utilisé pour réinitialiser la config.
   */
  public async resetToDefault(): Promise<void> {
    await fs.writeJSON(this.configPath, this.defaultConfig, { spaces: 2 });
    console.log('⚠️  Configuration réinitialisée aux valeurs par défaut.');
  }
}
