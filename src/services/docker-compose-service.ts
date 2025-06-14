import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';
import { deduceDeploymentOrder } from '../utils/docker-compose-utils.js';

export type Environment = 'dev' | 'prod';

export class DockerComposeService {
  /**
   * Retourne le nom du fichier docker-compose à utiliser selon l'environnement.
   */
  static getComposeFileName(env: Environment): string {
    return env === 'prod' ? 'docker-compose.prod.yml' : 'docker-compose.dev.yml';
  }

  /**
   * Récupère le contexte de build pour un service en lisant le fichier docker-compose.(dev|prod).yml.
   * Si le champ build est une chaîne, il est traité comme le contexte.
   * Sinon, s'il s'agit d'un objet, on utilise build.context.
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   */
  static async getServiceBuildContext(serviceName: string, env: Environment): Promise<string> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans ${composeFileName}`);
    }
    if (typeof serviceDef.build === 'string') {
      return path.resolve(process.cwd(), serviceDef.build);
    } else if (typeof serviceDef.build === 'object' && serviceDef.build.context) {
      return path.resolve(process.cwd(), serviceDef.build.context);
    }
    return path.join(process.cwd(), 'containers', serviceName);
  }

  /**
   * Déduit l'ordre d'un service à partir du docker-compose.(dev|prod).yml en se basant sur l'ordre d'apparition des clés.
   * Cette fonction est utilisée si le champ "order" n'est pas défini dans la configuration du service.
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   * @returns Un nombre représentant l'ordre (commençant à 1).
   */
  static async getServiceOrder(serviceName: string, env: Environment): Promise<number> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    const orderList: string[] = await deduceDeploymentOrder(composePath);
    const index = orderList.indexOf(serviceName);
    if (index === -1) {
      throw new Error(`Service '${serviceName}' non trouvé dans l'ordre déduit du ${composeFileName}.`);
    }
    return index + 1;
  }

  /**
   * Récupère le health check d'un service depuis le docker-compose.(dev|prod).yml.
   * On s'attend à ce que le champ healthcheck.test contienne la commande (souvent ["CMD", "/scripts/check_health.sh"]).
   *
   * @param serviceName Nom du service.
   * @param env Environnement ('dev' ou 'prod').
   * @returns La commande de health check sous forme de chaîne.
   */
  static async getServiceHealthCheck(serviceName: string, env: Environment): Promise<string> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const serviceDef = composeData.services?.[serviceName];
    if (!serviceDef) {
      throw new Error(`Service '${serviceName}' non trouvé dans ${composeFileName}`);
    }
    if (serviceDef.healthcheck && serviceDef.healthcheck.test) {
      const test = serviceDef.healthcheck.test;
      if (Array.isArray(test)) {
        return test.join(' ');
      } else if (typeof test === 'string') {
        return test;
      }
    }
    throw new Error(`Le service '${serviceName}' ne possède pas de healthcheck défini dans ${composeFileName}`);
  }

  /**
   * Vérifie les noms d'images dans le fichier docker-compose.(dev|prod).yml.
   * Pour chaque service, si la propriété "image" est absente ou ne correspond pas au format attendu,
   * on retourne une liste d'écarts.
   *
   * @param env Environnement ('dev' ou 'prod').
   * @param artifactRegistry L'URL ou l'identifiant du registry à utiliser pour composer l'image.
   * @returns Une liste d'objets décrivant les écarts (serviceName, currentImage, expectedImage).
   */
  static async checkImageNames(
    env: Environment,
    artifactRegistry: string
  ): Promise<{ serviceName: string; currentImage: string; expectedImage: string }[]> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);
    const discrepancies: { serviceName: string; currentImage: string; expectedImage: string }[] = [];

    for (const serviceName in composeData.services) {
      const serviceDef = composeData.services[serviceName];
      const expectedImage = `${artifactRegistry}/${serviceName}:latest`;
      const currentImage: string = serviceDef.image || '';
      if (currentImage !== expectedImage) {
        discrepancies.push({ serviceName, currentImage, expectedImage });
      }
    }
    return discrepancies;
  }

  /**
   * Corrige les noms d'images dans le fichier docker-compose.(dev|prod).yml pour qu'ils soient conformes.
   *
   * @param env Environnement ('dev' ou 'prod').
   * @param artifactRegistry L'URL ou l'identifiant du registry à utiliser.
   */
  static async correctImageNames(env: Environment, artifactRegistry: string): Promise<void> {
    const composeFileName = DockerComposeService.getComposeFileName(env);
    const composePath = path.join(process.cwd(), composeFileName);
    if (!(await fs.pathExists(composePath))) {
      throw new Error(`Fichier ${composeFileName} introuvable dans ${process.cwd()}`);
    }
    const composeContent = await fs.readFile(composePath, 'utf8');
    const composeData: any = yaml.load(composeContent);

    let modified = false;
    for (const serviceName in composeData.services) {
      const serviceDef = composeData.services[serviceName];
      const expectedImage = `${artifactRegistry}/${serviceName}:latest`;
      if (serviceDef.image !== expectedImage) {
        console.log(
          `Service ${serviceName} : image actuelle "${serviceDef.image || 'absente'}" -> attendue "${expectedImage}"`
        );
        serviceDef.image = expectedImage;
        modified = true;
      }
    }
    if (modified) {
      const updatedContent = yaml.dump(composeData);
      await fs.writeFile(composePath, updatedContent, 'utf8');
      console.log(`Fichier ${composeFileName} mis à jour avec les noms d'images conformes.`);
    } else {
      console.log(`Les noms d'images dans ${composeFileName} sont déjà conformes.`);
    }
  }
}