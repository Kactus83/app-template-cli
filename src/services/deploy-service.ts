import chalk from 'chalk';
import prompts from 'prompts';
import { ExtendedServiceConfig } from '../config/template-config.js';
import { ServiceConfigManager } from './service-config-manager.js';
import { ConfigService } from './config-service.js';
import { ImagePushService } from './image-push-service.js';
import { DockerComposeService, Environment } from './docker-compose-service.js';
import { RunService } from './run-service.js';

export class DeployService {
  static async deployAllServices(): Promise<void> {
    let cliConfig = await ConfigService.getConfig();
    if (!cliConfig.provider) {
      console.warn(chalk.yellow('Aucun provider configuré dans le fichier CLI, push des images simulé.'));
      await ConfigService.ensureOrPromptConfig();
      cliConfig = await ConfigService.getConfig();
      if (!cliConfig.provider) {
        console.warn(chalk.yellow('Aucun provider configuré, abandon du push réel.'));
        return;
      }
    }
    
    // Vérification et correction des noms d'images dans docker-compose.prod.yml
    const discrepancies = await DockerComposeService.checkImageNames('prod', cliConfig.provider.artifactRegistry);
    if (discrepancies.length > 0) {
      console.log(chalk.yellow("Des écarts dans les noms d'images ont été détectés :"));
      discrepancies.forEach(d =>
        console.log(`- Service ${d.serviceName}: actuel = "${d.currentImage || 'non défini'}", attendu = "${d.expectedImage}"`)
      );
      const response = await prompts({
        type: 'confirm',
        name: 'fix',
        message: 'Voulez-vous corriger automatiquement ces noms d\'images selon les standards ?',
        initial: true
      });
      if (response.fix) {
        await DockerComposeService.correctImageNames('prod', cliConfig.provider.artifactRegistry);
      }
    }

    // Vérification et correction des drivers de volumes dans docker-compose.prod.yml
    const volumeDiscrepancies = await DockerComposeService.checkVolumeDrivers('prod', cliConfig.provider.name);
    if (volumeDiscrepancies.length > 0) {
      console.log(chalk.yellow("Des écarts dans les drivers de volumes ont été détectés :"));
      volumeDiscrepancies.forEach(d =>
        console.log(`- Volume ${d.volumeName}: driver actuel = "${d.currentDriver}", attendu = "${d.expectedDriver}"`)
      );
      const responseVolumes = await prompts({
        type: 'confirm',
        name: 'fixVolumes',
        message: 'Voulez-vous corriger automatiquement ces configurations de volumes ?',
        initial: true
      });
      if (responseVolumes.fixVolumes) {
        await DockerComposeService.correctVolumeDrivers('prod', cliConfig.provider.name);
      }
    }

    // Récupérer la liste des services à déployer
    const services: ExtendedServiceConfig[] = await ServiceConfigManager.listServices('prod');

    // Pousser les images pour chaque service
    for (const service of services) {
      console.log(chalk.blue(`Déploiement du service : ${service.name} (order: ${service.order})`));
      try {
        await ImagePushService.pushImage(service, cliConfig.provider);
      } catch (error) {
        console.error(chalk.red(`Erreur lors du push de l'image pour le service ${service.name}:`), error);
        throw error;
      }
    }

    // Lancer les containers via RunService
    console.log(chalk.blue("Lancement des containers via RunService..."));
    await RunService.runContainers('prod');
    console.log(chalk.green("Déploiement terminé, tous les containers sont lancés."));
  }
}