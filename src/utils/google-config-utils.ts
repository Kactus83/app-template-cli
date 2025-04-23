import prompts from 'prompts';
import chalk from 'chalk';
import {
  GOOGLE_CLOUD_REGIONS,
  correctRegionInput,
  validateZoneInput,
  suggestZonesForRegion,
} from './google-naming-utils.js';
import { GoogleProviderConfig } from '../config/cli-config.js';

/**
 * Prompt les champs Google : region, zone, filestoreExportPath, mountOptions.
 * Reprend la valeur existante si présente, propose de la modifier.
 */
export async function promptGoogleConfig(
  existing: Partial<GoogleProviderConfig> = {}
): Promise<Pick<GoogleProviderConfig, 'region' | 'zone' | 'filestoreExportPath' | 'mountOptions'>> {
  let { region, zone, filestoreExportPath, mountOptions } = existing;

  // Région
  if (region) {
    console.log(chalk.cyan(`→ Région actuelle : ${region}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver cette région ?',
      initial: true
    });
    if (!reuse) region = undefined;
  }
  if (!region) {
    const { region: r } = await prompts({
      type: 'text',
      name: 'region',
      message: 'Entrez la région Google Cloud (ex: europe-west1) :',
      validate: v => {
        const c = correctRegionInput(v);
        return GOOGLE_CLOUD_REGIONS.includes(c)
          ? true
          : `Région invalide. Possibles : ${GOOGLE_CLOUD_REGIONS.join(', ')}`;
      }
    });
    region = correctRegionInput(r);
  }

  // Zone
  if (zone) {
    console.log(chalk.cyan(`→ Zone actuelle : ${zone}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver cette zone ?',
      initial: true
    });
    if (!reuse) zone = undefined;
  }
  if (!zone) {
    const suggestions = suggestZonesForRegion(region!);
    const { zone: z } = await prompts({
      type: 'text',
      name: 'zone',
      message: `Entrez la zone pour Filestore (ex: ${region}-a) :`,
      validate: v =>
        validateZoneInput(v)
          ? true
          : suggestions.length
            ? `Zone invalide. Suggestions : ${suggestions.join(', ')}`
            : 'Zone invalide'
    });
    zone = validateZoneInput(z)!;
  }

  // filestoreExportPath
  if (filestoreExportPath) {
    console.log(chalk.cyan(`→ Chemin export actuel : ${filestoreExportPath}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce chemin d’export ?',
      initial: true
    });
    if (!reuse) filestoreExportPath = undefined;
  }
  if (!filestoreExportPath) {
    const { filestoreExportPath: f } = await prompts({
      type: 'text',
      name: 'filestoreExportPath',
      message: 'Chemin d’export Filestore (serveur NFS) :',
      initial: '/',
      validate: v => v.startsWith('/') ? true : 'Doit commencer par "/"'
    });
    filestoreExportPath = f;
  }

  // mountOptions
  if (mountOptions) {
    console.log(chalk.cyan(`→ Options montage actuelles : ${mountOptions}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ces options de montage ?',
      initial: true
    });
    if (!reuse) mountOptions = undefined;
  }
  if (!mountOptions) {
    const { mountOptions: m } = await prompts({
      type: 'text',
      name: 'mountOptions',
      message: 'Options de montage NFS (ex: nolock,hard,timeo=600) :',
      initial: 'nolock,hard,timeo=600',
      validate: v => v.split(',').length > 0 ? true : 'Au moins une option requise'
    });
    mountOptions = m;
  }

  return {
    region: region!,
    zone: zone!,
    filestoreExportPath: filestoreExportPath!,
    mountOptions: mountOptions!
  };
}
