import { CliConfig } from "../../config/cli-config.js";

export interface IProviderInfraService {
  /**
   * Vérifie que la configuration CLI est complète et valide pour le provider.
   */
  verifyConfig(config: CliConfig): Promise<boolean>;

  /**
   * Corrige la configuration manquante ou invalide en interagissant avec l'utilisateur.
   */
  correctConfig(config: CliConfig): Promise<CliConfig>;

  /**
   * Vérifie que l'infrastructure (les ressources provisionnées) est accessible.
   */
  verifyInfra(config: CliConfig): Promise<boolean>;

  /**
   * Provisionne l'infrastructure via Terraform.
   */
  initInfra(config: CliConfig): Promise<void>;
}
