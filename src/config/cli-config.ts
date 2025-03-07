/**
 * Interface de configuration de l'application.
 */
export interface CliConfig {
    projectName: string;
    performTests: boolean;
    performLint: boolean;
    hotFrontend: boolean;
    openWindow: boolean;
    // Vous pouvez ajouter d'autres paramètres de configuration ici
  }
  
  /**
   * Configuration par défaut.
   */
  export const defaultCliConfig: CliConfig = {
    projectName: "app-template",
    performTests: true,
    performLint: true,
    hotFrontend: false,
    openWindow: false
  };
  