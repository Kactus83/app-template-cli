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
  /**
   * Liste les templates disponibles (via l’API protégée).
   */
  public static async listTemplates(): Promise<Template[]> {
    const { endpoints, version }: CliConfig = await new ConfigService().getConfig();
    const token = await new AuthService().getAccessToken();
    const resp = await axios.get<Template[]>(
      `${endpoints.backendUrl}/app-templates`,
      {
        headers: {
          Authorization:        `Bearer ${token}`,
          'x-frontend-version': version.frontend,
        },
      }
    );
    return resp.data;
  }

  /**
   * Télécharge et déploie un template ZIP.
   * @param templateId L’ID du template à récupérer.
   * @param targetDir  Répertoire de destination.
   */
  public static async fetchTemplate(
    templateId: string,
    targetDir: string
  ): Promise<void> {
    const { endpoints, version }: CliConfig = await new ConfigService().getConfig();
    const token = await new AuthService().getAccessToken();
    const downloadUrl = `${endpoints.backendUrl}/app-templates/${templateId}/download`;

    // 1) Télécharger en stream
    const resp = await axios.get<import('stream').Readable>(downloadUrl, {
      headers: {
        Authorization:        `Bearer ${token}`,
        'x-frontend-version': version.frontend,
      },
      responseType: 'stream',
      validateStatus: () => true,
    });

    // 2) Debug headers et status
    console.log('🛠️ DEBUG Download HTTP status:', resp.status);
    console.log('🛠️ DEBUG Content-Type:', resp.headers['content-type']);
    console.log('🛠️ DEBUG Content-Length:', resp.headers['content-length']);

    // 3) Gérer les erreurs JSON
    if (resp.status !== 200) {
      const chunks: Buffer[] = [];
      for await (const chunk of resp.data) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      let errMsg = `Statut ${resp.status}`;
      try {
        const txt = Buffer.concat(chunks).toString('utf8');
        const err = JSON.parse(txt);
        errMsg = err.message || txt;
      } catch {
        // on garde errMsg brut
      }
      throw new Error(`Échec du téléchargement du template : ${errMsg}`);
    }

    // 4) Écriture du ZIP brut dans un fichier temporaire
    const tmpZipDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appwizard-'));
    const zipFilePath = path.join(tmpZipDir, `${templateId}.zip`);
    const writer = fs.createWriteStream(zipFilePath);
    await new Promise<void>((resolve, reject) => {
      resp.data.pipe(writer);
      resp.data.on('error', reject);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // 5) Debug signature du fichier ZIP (4 premiers octets)
    try {
      const fd = await fs.open(zipFilePath, 'r');
      const buf = Buffer.alloc(4);
      await fs.read(fd, buf, 0, 4, 0);
      await fs.close(fd);
      console.log('🛠️ DEBUG ZIP signature (hex):', buf.toString('hex'));
      // signature valide = '504b0304'
    } catch (e) {
      console.log('🛠️ DEBUG impossible de lire la signature ZIP:', e);
    }

    // 6) Vérification et extraction
    let zip: AdmZip;
    try {
      zip = new AdmZip(zipFilePath);
    } catch (e) {
      throw new Error(
        `Le fichier reçu n'est pas un ZIP valide (${e instanceof Error ? e.message : e})`
      );
    }

    const extractDir = await fs.mkdtemp(path.join(os.tmpdir(), 'appwizard-'));
    try {
      zip.extractAllTo(extractDir, true);
      console.log(`📂 Copie vers ${targetDir}…`);
      await fs.copy(extractDir, targetDir, { overwrite: true });
      console.log('✅ Template déployé.');
    } finally {
      await fs.remove(tmpZipDir);
      await fs.remove(extractDir);
    }
  }
}
