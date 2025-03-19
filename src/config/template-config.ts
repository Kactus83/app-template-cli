/**
 * Interface pour la configuration globale du template.
 */
export interface TemplateConfig {
  name: string;
  version: string;
  description: string;
  prebuildCommand?: string;
  devRunCommand?: string;
}

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
 * Configuration par défaut pour le template.
 */
export const defaultTemplateConfig: TemplateConfig = {
  name: "Repaired Template",
  version: "0.0.0",
  description: "Le template a été automatiquement réparé. Veuillez vérifier les configurations. Cette situation se produit si le fichier de configuration a été modifié de manière incorrecte ou supprimé.",
  prebuildCommand: "docker-compose -f docker-compose.prebuild.yml up --abort-on-container-exit prebuild",
  devRunCommand: "docker-compose -f docker-compose.dev.yml up"
};


/**
 * Interface pour l'affichage d'un service, qui étend ServiceConfig en ajoutant le nom du service.
 */
export interface ExtendedServiceConfig extends ServiceConfig {
  order: number;
  name: string;
  healthCheck: string;
}