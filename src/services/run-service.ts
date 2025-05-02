import { spawnSync, SpawnSyncReturns } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { GoogleCliConfig, AWSCliConfig, Provider } from '../config/cli-config.js';
import { ComputeInfraData } from './cloud/types.js';

/**
 * Service pour démarrer les containers Docker en production
 * sur une VM distante (Google Compute Engine ou AWS EC2).
 */
export class RunService {
  /**
   * Copie le fichier docker-compose.<env>.yml sur la VM et lance `docker-compose up -d`.
   *
   * @param env       Nom de l’environnement (‘prod’)
   * @param cliConfig Configuration CLI (GoogleCliConfig ou AWSCliConfig)
   * @param compute   Données de la VM (ComputeInfraData)
   */
  static async runContainers(
    env: 'prod',
    cliConfig: GoogleCliConfig | AWSCliConfig,
    compute: ComputeInfraData
  ): Promise<void> {
    console.log(chalk.blue(`Démarrage des containers "${env}" sur la VM…`));

    // 1) chemin local du compose
    const composeFile = `docker-compose.${env}.yml`;
    const localComposePath = path.join(process.cwd(), composeFile);
    if (!(await fs.pathExists(localComposePath))) {
      throw new Error(`Fichier introuvable : ${localComposePath}`);
    }

    const providerName = cliConfig.provider.name;
    const { publicIp, sshUser, sshKeyPath, instanceName } = compute;

    // 2) selon le provider
    if (providerName === Provider.GOOGLE_CLOUD) {
      const gcfg = cliConfig as GoogleCliConfig;
      console.log(chalk.green(`✓ VM GCP détectée : ${instanceName}@${publicIp}`));

      // 2.a) scp via gcloud
      this._execOrThrow(spawnSync('gcloud', [
        'compute', 'scp',
        '--project', gcfg.projectName,
        '--zone', gcfg.provider.zone,
        localComposePath,
        `${instanceName}:~/${composeFile}`
      ], { stdio: 'inherit' }), 'Échec de la copie du docker-compose sur la VM GCP');

      // 2.b) ssh + docker-compose up
      this._execOrThrow(spawnSync('gcloud', [
        'compute', 'ssh', instanceName,
        '--project', gcfg.projectName,
        '--zone', gcfg.provider.zone,
        '--command', `docker-compose -f ~/${composeFile} up -d`
      ], { stdio: 'inherit' }), 'Échec du lancement des containers sur la VM GCP');

    } else if (providerName === Provider.AWS) {
      console.log(chalk.green(`✓ VM AWS détectée : ${sshUser}@${publicIp}`));

      const sshOpts = [
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'UserKnownHostsFile=/dev/null',
        '-i', sshKeyPath
      ];

      // 2.a) scp
      this._execOrThrow(spawnSync('scp', [
        ...sshOpts,
        localComposePath,
        `${sshUser}@${publicIp}:~/${composeFile}`
      ], { stdio: 'inherit' }), 'Échec de la copie du docker-compose sur la VM AWS');

      // 2.b) ssh + docker-compose up
      this._execOrThrow(spawnSync('ssh', [
        ...sshOpts,
        `${sshUser}@${publicIp}`,
        `docker-compose -f ~/${composeFile} up -d`
      ], { stdio: 'inherit' }), 'Échec du lancement des containers sur la VM AWS');

    } else {
      throw new Error(`Provider non supporté pour le run : ${providerName}`);
    }

    console.log(chalk.green('\n✓ Tous les containers ont été lancés sur la VM.'));
  }

  /**
   * Vérifie le code de sortie d'une commande spawnSync et lève une erreur si non nul.
   *
   * @param res    Résultat de spawnSync
   * @param errMsg Message d’erreur à afficher/lever si échec
   */
  private static _execOrThrow(res: SpawnSyncReturns<any>, errMsg: string) {
    if (res.error) {
      throw new Error(`${errMsg} : ${res.error.message}`);
    }
    if (res.status !== 0) {
      throw new Error(`${errMsg} (status ${res.status})`);
    }
  }
}
