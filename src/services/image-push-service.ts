import { execSync } from 'child_process';
import chalk from 'chalk';
import https from 'https';
import { ExtendedServiceConfig } from '../config/template-config.js';
import { ProviderConfig } from '../config/cli-config.js';

export class ImagePushService {
  /**
   * Vérifie si le registry est accessible en effectuant une requête GET sur l'endpoint /v2/.
   * Le registry est considéré accessible si le status renvoyé est 200 ou 401 (ce qui signifie qu'il existe,
   * même si l'authentification est requise).
   * @param provider Configuration du provider.
   * @returns Une promesse qui résout à true si accessible, false sinon.
   */
  static checkRegistryAccessible(provider: ProviderConfig): Promise<boolean> {
    return new Promise((resolve) => {
      // Supposons que provider.artifactRegistry est de la forme "domain/path"
      const parts = provider.artifactRegistry.split('/');
      const host = parts[0];
      const options = {
        hostname: host,
        port: 443,
        path: '/v2/',
        method: 'GET',
        timeout: 5000, // timeout de 5 secondes
      };

      const req = https.request(options, (res) => {
        // Un status de 200 ou 401 indique que le registry existe (401 signifie qu'une authentification est nécessaire)
        if (res.statusCode === 200 || res.statusCode === 401) {
          resolve(true);
        } else {
          resolve(false);
        }
      });

      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.end();
    });
  }

  /**
   * Pousse l'image du service vers le registry du provider.
   * Avant le push, vérifie que le registry est accessible afin d'éviter des erreurs inutiles.
   * @param service Configuration du service à pousser.
   * @param provider Configuration du provider (ex: google_cloud, aws).
   * @param tag Tag de l'image (par défaut "latest").
   */
  static async pushImage(
    service: ExtendedServiceConfig,
    provider: ProviderConfig,
    tag: string = 'latest'
  ): Promise<void> {
    // Vérifier l'accessibilité du registry
    const accessible = await ImagePushService.checkRegistryAccessible(provider);
    if (!accessible) {
      console.error(
        chalk.red(`Le registry ${provider.artifactRegistry} n'est pas accessible. Abandon du push pour ${service.name}.`)
      );
      throw new Error(`Registry ${provider.artifactRegistry} inaccessible`);
    }

    let pushCommand = '';
    switch (provider.name) {
      case 'google_cloud':
        console.log(chalk.blue(`Authentification pour Google Cloud (si nécessaire)...`));
        // Optionnel : authentification via gcloud
        // execSync('gcloud auth configure-docker', { stdio: 'inherit' });
        pushCommand = `docker push ${provider.artifactRegistry}/${service.name}:${tag}`;
        break;
      case 'aws':
        console.log(chalk.blue(`Authentification pour AWS ECR (si nécessaire)...`));
        // Exemple de commande d'authentification AWS ECR :
        // execSync(`aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${provider.artifactRegistry}`, { stdio: 'inherit' });
        pushCommand = `docker push ${provider.artifactRegistry}/${service.name}:${tag}`;
        break;
      default:
        throw new Error(`Provider '${provider.name}' non supporté pour le push des images.`);
    }

    console.log(chalk.blue(`Exécution du push pour ${service.name} avec la commande : ${pushCommand}`));
    try {
      execSync(pushCommand, { stdio: 'inherit' });
      console.log(chalk.green(`Image pour ${service.name} poussée avec succès vers ${provider.artifactRegistry}.`));
    } catch (error) {
      console.error(chalk.red(`Erreur lors du push de l'image pour ${service.name}:`), error);
      throw error;
    }
  }
}