/**
 * @module services/fetch-template-service
 * Liste et télécharge un template, en passant le header `x-frontend-version`.
 */

import fs from 'fs-extra';
import * as path from 'path';
import os from 'os';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { AuthService } from './auth-service.js';
import { ConfigService } from './config-service.js';
import type { Template } from '../types/template.js';
import type { CliConfig } from '../types/cli-config.js';

export class FetchTemplateService {
  public static async listTemplates(): Promise<Template[]> {
    const { endpoints, version }: CliConfig = await new ConfigService().getConfig();
    const token = await new AuthService().getAccessToken();
    const resp = await axios.get<Template[]>(
      `${endpoints.backendUrl}/app-templates`,
      {
        headers: {
          Authorization:        `Bearer ${token}`,
          'x-frontend-version': version.frontend,
        }
      }
    );
    return resp.data;
  }

  public static async fetchTemplate(templateId: string, targetDir: string): Promise<void> {
    const { endpoints, version }: CliConfig = await new ConfigService().getConfig();
    const token         = await new AuthService().getAccessToken();
    const archiveUrl    = `${endpoints.backendUrl}/app-templates/${templateId}/download`;
    const axiosResponse = await axios.get<ArrayBuffer>(
      archiveUrl,
      {
        headers: {
          Authorization:        `Bearer ${token}`,
          'x-frontend-version': version.frontend,
        },
        responseType: 'arraybuffer'
      }
    );

    // Extraction
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appwizard-'));
    try {
      const zip = new AdmZip(Buffer.from(axiosResponse.data));
      zip.extractAllTo(tmpDir, true);
      console.log(`📂 Copie vers ${targetDir}…`);
      await fs.copy(tmpDir, targetDir, { overwrite: true });
      console.log('✅ Template déployé.');
    } finally {
      await fs.remove(tmpDir);
    }
  }
}
