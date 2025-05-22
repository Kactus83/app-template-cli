/**
 * @module types/cli-config
 * Définit la configuration CLI stockée dans ~/.appwizard
 */

export interface EndpointsConfig {
  backendUrl: string;
  frontendUrl: string;
}

export interface VersionConfig {
  /** Version backend (non utilisée côté CLI mais chargée pour symétrie) */
  backend: string;
  /** Version frontend à envoyer au backend */
  frontend: string;
}

/**
 * Configuration CLI complète.
 */
export interface CliConfig {
  endpoints: EndpointsConfig;
  version: VersionConfig;
}
