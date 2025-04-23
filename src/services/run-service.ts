import { execSync } from 'child_process';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { ServiceConfigManager } from './service-config-manager.js';
import { ExtendedServiceConfig } from '../config/template-config.js';

export class RunService {
  /**
   * Démarre les containers en production, **sur la VM** provisionnée.
   * Il :
   * 1) lit ./prod-deployments/infra/[provider]/compute.json pour récupérer publicIp, sshUser et sshKeyPath
   * 2) envoie le docker-compose.prod.yml sur la VM via scp
   * 3) pour chaque service, lance `docker-compose up -d` par ssh
   * 4) exécute, si défini, le healthCheck à distance (timeout = 60s)
   */
  static async runContainers(env: 'prod' = 'prod'): Promise<void> {
    console.log(chalk.blue(`Démarrage des containers en "${env}" sur la VM…`));

    // 1️⃣ Récupère compute.json
    const infraRoot = path.join(process.cwd(), 'prod-deployments', 'infra');
    const providerDirs = await fs.readdir(infraRoot);
    let computeJsonPath: string | undefined;
    for (const dir of providerDirs) {
      const p = path.join(infraRoot, dir, 'compute.json');
      if (await fs.pathExists(p)) { computeJsonPath = p; break; }
    }
    if (!computeJsonPath) {
      throw new Error('Aucun compute.json trouvé sous prod-deployments/infra/*');
    }
    const { publicIp, sshUser, sshKeyPath } = JSON.parse(
      await fs.readFile(computeJsonPath, 'utf8')
    );
    console.log(chalk.green(`✓ VM détectée : ${sshUser}@${publicIp}`));

    // 2️⃣ Transfert du compose file
    const localCompose = `docker-compose.${env}.yml`;
    const remoteCompose = `~/docker-compose.${env}.yml`;
    console.log(chalk.blue(`→ Transfert de ${localCompose} vers la VM…`));
    execSync(
      `scp -i ${sshKeyPath} ${localCompose} ${sshUser}@${publicIp}:${remoteCompose}`,
      { stdio: 'inherit' }
    );

    // 3️⃣ Récupère la liste des services à lancer
    let services: ExtendedServiceConfig[];
    try {
      services = await ServiceConfigManager.listServices(env);
      if (services.length === 0) {
        throw new Error('Aucun service configuré à lancer en prod');
      }
    } catch (err) {
      console.error(chalk.red('✖ Impossible de lister les services :'), err);
      throw err;
    }

    // 4️⃣ Pour chaque service, on lance docker-compose dans la VM
    for (const svc of services) {
      console.log(chalk.blue(`\nLancement du service : ${svc.name} (order: ${svc.order})…`));
      const upCmd = `docker-compose -f ${remoteCompose} up -d ${svc.name}`;
      execSync(
        `ssh -i ${sshKeyPath} ${sshUser}@${publicIp} "${upCmd}"`,
        { stdio: 'inherit' }
      );

      // 5️⃣ Healthcheck distant (timeout 60s)
      if (svc.healthCheck) {
        console.log(chalk.blue(`→ Healthcheck de ${svc.name} (60s)…`));
        try {
          execSync(
            `ssh -i ${sshKeyPath} ${sshUser}@${publicIp} "${svc.healthCheck}"`,
            { stdio: 'inherit', timeout: 60_000 }
          );
        } catch {
          console.warn(chalk.yellow(`⚠ Healthcheck pour ${svc.name} a échoué ou timeout, on poursuit.`));
        }
      }

      console.log(chalk.green(`✓ Service ${svc.name} lancé.`));
    }

    console.log(chalk.green('\nTous les services ont été lancés sur la VM avec succès.'));
  }
}