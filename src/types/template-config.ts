/**
 * @file template-config.ts
 * @description Définit les interfaces et la configuration par défaut pour le template et ses services.
 * @author [Flo]
 */

/**
 * Interface pour la configuration globale du template.
 */
export interface TemplateConfig {
  name: string;
  version: string;
  description: string;

  // Commandes « prebuild »
  prebuildDevCommand: string;
  prebuildProdCommand: string;

  // Commandes « build »
  buildDevCommand: string;
  buildProdCommand: string;

  // Commandes « run »
  runDevCommand: string;
  runProdCommand: string;
}

/**
 * Configuration par défaut pour le template.
 */
export const defaultTemplateConfig: TemplateConfig = {
  name: "Repaired Template",
  version: "0.0.0",
  description:
    "Le template a été automatiquement réparé. Veuillez vérifier les configurations.",

  prebuildDevCommand: "docker-compose -f docker-compose.prebuild.yml up --abort-on-container-exit prebuild",
  prebuildProdCommand: "docker-compose -f docker-compose.prod.prebuild.yml up --abort-on-container-exit prebuild",

  buildDevCommand: "docker-compose -f docker-compose.dev.yml build",
  buildProdCommand: "docker-compose -f docker-compose.prod.yml build",

  runDevCommand: "docker-compose -f docker-compose.dev.yml up",
  runProdCommand: "docker-compose -f docker-compose.prod.yml up",
};


/**
 * Interface pour la configuration d'un service.
 * - prodAddress : adresse de déploiement en production.
 * - vaultRole : nom du rôle dans Vault associé à ce service.
 * - secrets : liste des secrets nécessaires au conteneur.
 * - scripts : commandes à exécuter pour build, run et deploy, chacune avec une version pour dev et prod.
 */
export interface ServiceConfig {
  prodAddress: string;
  vaultRole: string;
  secrets: string[];
}

/**
 * Interface pour l'affichage d'un service, qui étend ServiceConfig en ajoutant le nom du service.
 */
export interface ExtendedServiceConfig extends ServiceConfig {
  order: number;
  name: string;
  healthCheck: string;
}