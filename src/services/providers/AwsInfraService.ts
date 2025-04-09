
import { execSync } from "child_process";
import chalk from "chalk";
import prompts from "prompts";
import { IProviderInfraService } from "./IProviderInfraService.js";
import { CliConfig } from "../../config/cli-config.js";
import * as path from "path";

export class AwsInfraService implements IProviderInfraService {
  /**
   * Vérifie que la configuration AWS est complète.
   * Exige notamment que subnetId et securityGroups soient renseignés.
   *
   * @param config La configuration CLI.
   * @returns true si la configuration est valide, false sinon.
   */
  async verifyConfig(config: CliConfig): Promise<boolean> {
    if (!config.provider) {
      console.error(chalk.red("Aucun provider configuré pour AWS."));
      return false;
    }
    if (!config.provider.subnetId || config.provider.subnetId.trim() === "") {
      console.error(chalk.red("Le champ subnetId est obligatoire pour AWS."));
      return false;
    }
    if (!config.provider.securityGroups || config.provider.securityGroups.length === 0) {
      console.error(chalk.red("Au moins un groupe de sécurité doit être renseigné pour AWS."));
      return false;
    }
    return true;
  }

  /**
   * Corrige la configuration AWS de manière interactive.
   * Invite l'utilisateur à renseigner les champs subnetId et securityGroups si manquants.
   *
   * @param config La configuration CLI.
   * @returns La configuration mise à jour.
   */
  async correctConfig(config: CliConfig): Promise<CliConfig> {
    let updated = false;
    if (!config.provider) {
      throw new Error("Le provider AWS n'est pas configuré.");
    }
    if (!config.provider.subnetId || config.provider.subnetId.trim() === "") {
      const response = await prompts({
        type: "text",
        name: "subnetId",
        message: "Veuillez renseigner l'ID du subnet pour AWS :"
      });
      if (response.subnetId && response.subnetId.trim() !== "") {
        config.provider.subnetId = response.subnetId;
        updated = true;
      }
    }
    if (!config.provider.securityGroups || config.provider.securityGroups.length === 0) {
      const response = await prompts({
        type: "list",
        name: "securityGroups",
        message: "Veuillez renseigner les IDs des groupes de sécurité pour AWS (séparés par une virgule) :",
        separator: ",",
        validate: value => (value && value.length > 0 ? true : "Veuillez fournir au moins un groupe de sécurité.")
      });
      if (response.securityGroups && response.securityGroups.length > 0) {
        config.provider.securityGroups = response.securityGroups;
        updated = true;
      }
    }
    if (updated) {
      console.log(chalk.green("Configuration AWS mise à jour."));
      // Optionnel : sauvegarder la configuration via ConfigService
    }
    return config;
  }

  /**
   * Vérifie l'infrastructure AWS.
   * Ici, la vérification est factice et doit être complétée avec des appels réels à l'AWS SDK.
   *
   * @param config La configuration CLI.
   * @returns true si l'infrastructure est accessible, false sinon.
   */
  async verifyInfra(config: CliConfig): Promise<boolean> {
    console.log(chalk.blue("Vérification de l'infrastructure AWS (RDS et EFS)..."));
    // Placeholder : à implémenter avec l'AWS SDK pour vérifier l'état de RDS et d'EFS.
    return false;
  }

  /**
   * Provisionne l'infrastructure AWS via Terraform.
   * Génère le fichier de variables Terraform et exécute les commandes Terraform.
   *
   * @param config La configuration CLI.
   */
  async initInfra(config: CliConfig): Promise<void> {
    console.log(chalk.yellow("Provisionnement des ressources AWS via Terraform..."));
    try {
      const { generateTerraformVars } = await import("../terraform-config-generator.js");
      await generateTerraformVars(config);
      const providerDir = "aws";
      const terraformDir = path.join(process.cwd(), "infra", providerDir);
      execSync("terraform init", { cwd: terraformDir, stdio: "inherit" });
      execSync("terraform apply -auto-approve", { cwd: terraformDir, stdio: "inherit" });
      console.log(chalk.green("Ressources AWS provisionnées avec succès."));
    } catch (error) {
      console.error(chalk.red("Erreur lors du provisionnement des ressources AWS:"), error);
      throw error;
    }
  }
}
