/**
 * Enum pour les providers (ex: "google_cloud", "aws", etc.).
 */
export enum Provider {
  GOOGLE_CLOUD = "google_cloud",
  AWS = "aws",
}

/**
 * Enum pour le dégré de performance de l'infra (Tiers) 
 */
export enum InfraPerformance {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
}

/**
 * Interface pour la configuration du provider (ex: "google_cloud", "aws", etc.).
 */
export interface ProviderConfig {
  name: Provider;
  artifactRegistry: string;
  // Pour AWS
  subnetId?: string;
  securityGroups?: string[];
  // Pour Google Cloud
  region?: string;
  zone?: string;
  performance?: InfraPerformance;
}

/**
 * Interface pour les options de build (tests, lint, etc.).
 */
export interface BuildOptions {
  performTests: boolean;
  performLint: boolean;
  hotFrontend: boolean;
  openWindow: boolean;
}

/**
 * Interface de configuration de l'application.
 * Seul projectName reste isolé, le reste est regroupé.
 */
export interface CliConfig {
  projectName: string;
  provider?: ProviderConfig;
  buildOptions: BuildOptions;
  pathToSSHKey?: string;
}

/**
 * Configuration par défaut.
 * Cette configuration sera utilisée si aucun fichier de configuration n'est présent et pourra être modifiée lors de la création.
 */
export const defaultCliConfig: CliConfig = {
  projectName: "app-template",
  buildOptions: {
    performTests: true,
    performLint: true,
    hotFrontend: false,
    openWindow: false
  }
};
