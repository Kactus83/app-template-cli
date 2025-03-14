/**
 * Interface pour la configuration du provider (ex: "google_cloud", "aws", etc.).
 */
export interface ProviderConfig {
  name: string;
  artifactRegistry: string;
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
