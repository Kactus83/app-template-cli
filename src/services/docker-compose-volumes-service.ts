import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { Environment } from './docker-compose-service.js';

/**
 * Configuration de montage pour Google Cloud Filestore.
 */
export interface FilestoreVolumeConfig {
  provider: 'google';
  filestoreIp: string;
  exportPath: string;
  mountOptions: string; // Par exemple : "rw,nfsvers=4.1"
}

/**
 * Configuration de montage pour AWS EFS.
 */
export interface EfsVolumeConfig {
  provider: 'aws';
  efsId: string;
  efsDns: string;
  exportPath?: string;   // Par défaut, "/"
  mountOptions: string;  // Par exemple : "rw,nfsvers=4.1"
}

/**
 * Type union pour la configuration du volume partagé selon le provider.
 */
export type SharedVolumeConfig = FilestoreVolumeConfig | EfsVolumeConfig;

/**
 * Définition attendue de la configuration d’un volume dans Docker Compose.
 * Ici, on s’appuie sur l’utilisation du driver "local" en combinaison avec les options de montage pour un partage NFS.
 */
export interface ExpectedVolumeDefinition {
  driver: string; // par exemple, "local"
  driver_opts: {
    type: string;   // ici "nfs"
    o: string;      // options de montage (contenant l'adresse du serveur et les options de montage)
    device: string; // le chemin d'export (ex: ":/filestore-sandbox" ou ":/")
  };
}

/**
 * Service dédié à la vérification et correction des volumes dans le fichier Docker Compose.
 * Ce service gère le cas prod (où il faut s'assurer que le montage se fait via NFS et le driver adéquat)
 * et effectue un check factice en mode dev.
 */
export class DockerComposeVolumesService {
  /**
   * Retourne le nom du fichier docker-compose à utiliser selon l'environnement.
   * Pour prod, on attend par exemple "docker-compose.prod.yml".
   */
  static getComposeFileName(env: Environment): string {
    return env === 'prod' ? 'docker-compose.prod.yml' : 'docker-compose.dev.yml';
  }

  /**
   * Charge et parse le fichier Docker Compose (YAML) de l'environnement spécifié.
   */
  static async loadComposeFile(env: Environment): Promise<any> {
    const composeFileName = DockerComposeVolumesService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const fileContent = await fs.readFile(composePath, 'utf8');
    return yaml.load(fileContent);
  }

  /**
   * Sauvegarde les modifications apportées aux fichiers Docker Compose.
   */
  static async saveComposeFile(env: Environment, data: any): Promise<void> {
    const composeFileName = DockerComposeVolumesService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    const yamlContent = yaml.dump(data);
    await fs.writeFile(composePath, yamlContent, 'utf8');
  }

  /**
   * Calcule la configuration attendue d’un volume selon la configuration fournie par le provider.
   */
  static computeExpectedVolumeDefinition(config: SharedVolumeConfig): ExpectedVolumeDefinition {
    let address: string;
    let exportPath: string;
    if (config.provider === 'google') {
      address = config.filestoreIp;
      exportPath = config.exportPath;
    } else { // Pour AWS
      address = config.efsDns;
      exportPath = config.exportPath || '/';
    }

    return {
      driver: 'local',
      driver_opts: {
        type: 'nfs',
        o: `addr=${address},${config.mountOptions}`,
        device: `:${exportPath}`
      }
    };
  }

  /**
   * Vérifie et corrige la configuration des volumes dans le fichier Docker Compose.
   * Si l'environnement est "dev", un simple message informatif est affiché (check factice).
   * Si l'environnement est "prod", la configuration des volumes est comparée à celle attendue et corrigée si nécessaire.
   *
   * @param env Environnement ('dev' ou 'prod').
   * @param volumeConfig Configuration de montage pour le provider utilisé.
   */
  static async verifyAndCorrectVolumes(env: Environment, volumeConfig: SharedVolumeConfig): Promise<void> {
    if (env !== 'prod') {
      console.log("En environnement de développement, la vérification des volumes est factice. Aucun changement n'est appliqué.");
      return;
    }

    const composeData = await DockerComposeVolumesService.loadComposeFile(env);
    if (!composeData.volumes) {
      console.log("Aucune section 'volumes' trouvée dans le fichier docker-compose.");
      return;
    }
    const expected = DockerComposeVolumesService.computeExpectedVolumeDefinition(volumeConfig);
    let modified = false;

    for (const volumeName in composeData.volumes) {
      const currentDef = composeData.volumes[volumeName];
      // Par défaut, le driver est considéré comme "local" s'il n'est pas défini.
      const currentDriver = currentDef.driver || 'local';
      if (
        currentDriver !== expected.driver ||
        !currentDef.driver_opts ||
        currentDef.driver_opts.type !== expected.driver_opts.type ||
        currentDef.driver_opts.o !== expected.driver_opts.o ||
        currentDef.driver_opts.device !== expected.driver_opts.device
      ) {
        console.log(`Mise à jour de la configuration du volume '${volumeName}':`);
        console.log(`- Driver actuel: ${currentDriver}, attendu: ${expected.driver}`);
        console.log(`- Options actuelles: ${JSON.stringify(currentDef.driver_opts)}, attendues: ${JSON.stringify(expected.driver_opts)}`);
        // On met à jour la configuration du volume.
        composeData.volumes[volumeName] = {
          driver: expected.driver,
          driver_opts: expected.driver_opts
        };
        modified = true;
      }
    }

    if (modified) {
      await DockerComposeVolumesService.saveComposeFile(env, composeData);
      console.log("Le fichier docker-compose a été mis à jour avec la configuration correcte pour les volumes.");
    } else {
      console.log("Les volumes du fichier docker-compose sont déjà correctement configurés.");
    }
  }
}