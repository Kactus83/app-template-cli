import { spawnSync, execSync } from "child_process";
import chalk from "chalk";
import prompts from "prompts";
import * as path from "path";
import fs from "fs-extra";
import { IProviderInfraService } from "./IProviderInfraService.js";
import { CliConfig, InfraPerformance, Provider, ProviderConfig } from "../../config/cli-config.js";
import {
  verifyCredentials,
  autoLoginIfNeeded,
  verifyDatabase,
  verifyFilestore,
  verifyProject,
  ensureDBUserInGoogle
} from "../../utils/google-infra-utils.js";
import {
  isValidRegion,
  isValidZone,
  correctRegionInput,
  validateZoneInput,
  suggestZonesForRegion,
  GOOGLE_CLOUD_REGIONS
} from "../../utils/google-naming-utils.js";

// Typage explicite pour la config Google incluant le niveau de performance
export interface GoogleProviderConfig extends ProviderConfig {
  region: string;
  zone: string;
  performance: InfraPerformance;
}

export class GoogleInfraService implements IProviderInfraService {
  async verifyConfig(config: CliConfig): Promise<boolean> {
    if (!config.projectName || config.projectName.trim() === "") {
      console.error(chalk.red("Le nom du projet est manquant dans la configuration CLI."));
      return false;
    }
    if (!config.provider) {
      console.error(chalk.red("La configuration du provider est absente."));
      return false;
    }
    if (!config.provider.region || config.provider.region.trim() === "") {
      console.error(chalk.red("La région pour Google Cloud n'est pas renseignée dans la configuration CLI."));
      return false;
    }
    if (!config.provider.zone || config.provider.zone.trim() === "") {
      console.error(chalk.red("La zone pour Google Cloud Filestore n'est pas renseignée dans la configuration CLI."));
      return false;
    }
    return verifyProject(config.projectName);
  }

  async correctConfig(config: CliConfig): Promise<CliConfig> {
    let updated = false;

    // Correction du projectName
    if (!config.projectName || config.projectName.trim() === "") {
      const response = await prompts({
        type: "text",
        name: "projectName",
        message: "Veuillez renseigner l'ID du projet Google Cloud :"
      });
      if (response.projectName && response.projectName.trim() !== "") {
        config.projectName = response.projectName.trim();
        updated = true;
      }
    }

    // Assurer que le provider existe
    if (!config.provider) {
      config.provider = { name: Provider.GOOGLE_CLOUD, artifactRegistry: "", region: "", zone: "", performance: InfraPerformance.LOW };
      updated = true;
    }
    // Forçage du typage en GoogleProviderConfig pour garantir la présence de region, zone et performance
    const provider = config.provider as GoogleProviderConfig;

    // Correction de la région
    if (!provider.region || provider.region.trim() === "") {
      while (!provider.region || !isValidRegion(provider.region)) {
        const response = await prompts({
          type: "text",
          name: "region",
          message: "Veuillez renseigner la région Google Cloud (ex: europe-west1) :",
          validate: value => {
            const corrected = correctRegionInput(value);
            return isValidRegion(corrected)
              ? true
              : `La région doit être parmi : ${GOOGLE_CLOUD_REGIONS.join(", ")}`;
          }
        });
        if (response.region && response.region.trim() !== "") {
          const corrected = correctRegionInput(response.region);
          if (isValidRegion(corrected)) {
            provider.region = corrected;
            updated = true;
          } else {
            const confirm = await prompts({
              type: "confirm",
              name: "accept",
              message: `La valeur "${response.region}" n'est pas reconnue. Voulez-vous l'accepter malgré tout ?`,
              initial: false
            });
            if (confirm.accept) {
              provider.region = response.region.trim();
              updated = true;
              break;
            }
          }
        }
      }
    }

    // Correction de la zone
    if (!provider.zone || provider.zone.trim() === "") {
      while (!provider.zone || !isValidZone(provider.zone)) {
        const response = await prompts({
          type: "text",
          name: "zone",
          message: `Veuillez renseigner la zone pour Filestore (ex: ${provider.region}-a) :`,
          validate: value => {
            const validZone = validateZoneInput(value);
            if (validZone) return true;
            const suggestions = provider.region ? suggestZonesForRegion(provider.region) : [];
            return suggestions.length ? `Valeur invalide. Choisissez parmi : ${suggestions.join(", ")}` : "Valeur invalide.";
          }
        });
        if (response.zone && response.zone.trim() !== "") {
          const zoneValue = validateZoneInput(response.zone);
          if (isValidZone(zoneValue)) {
            provider.zone = zoneValue;
            updated = true;
          } else {
            const confirm = await prompts({
              type: "confirm",
              name: "accept",
              message: `La valeur "${response.zone}" n'est pas reconnue. Voulez-vous l'accepter malgré tout ?`,
              initial: false
            });
            if (confirm.accept) {
              provider.zone = response.zone.trim();
              updated = true;
              break;
            }
          }
        }
      }
    }

    // Vérification et correction du niveau de performance
    if (!provider.performance) {
      const response = await prompts({
        type: "select",
        name: "performance",
        message: "Veuillez sélectionner le niveau de performance pour l'infrastructure :",
        choices: [
          { title: "Low", value: InfraPerformance.LOW },
          { title: "Medium", value: InfraPerformance.MEDIUM },
          { title: "High", value: InfraPerformance.HIGH }
        ]
      });
      if (response.performance) {
        provider.performance = response.performance;
        updated = true;
      }
    }

    if (updated) {
      console.log(chalk.green("Configuration Google Cloud mise à jour."));
      const configPath = path.join(process.cwd(), ".app-template");
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(chalk.green(`Configuration sauvegardée dans ${configPath}.`));
    }
    return config;
  }

  async verifyInfra(config: CliConfig): Promise<boolean> {
    if (!verifyCredentials()) {
      autoLoginIfNeeded();
    }
    if (!(await this.verifyConfig(config))) {
      console.error(chalk.red("La configuration Google Cloud est invalide."));
      const response = await prompts({
        type: "confirm",
        name: "fixConfig",
        message: "Voulez-vous corriger la configuration ?",
        initial: true
      });
      if (response.fixConfig) {
        config = await this.correctConfig(config);
        if (!(await this.verifyConfig(config))) {
          console.error(chalk.red("La configuration est toujours invalide après correction."));
          return false;
        }
      } else {
        console.error(chalk.red("Processus interrompu car la configuration n'a pas été corrigée."));
        return false;
      }
    }
    const projectId = config.projectName;
    // Forçage du typage en GoogleProviderConfig, validé précédemment
    const provider = config.provider as GoogleProviderConfig;
    const region: string = provider.region;
    const zone: string = provider.zone;
    const dbOk = await verifyDatabase();
    const filestoreOk = await verifyFilestore(projectId, zone, "filestore-sandbox");
    return dbOk && filestoreOk;
  }

  async initInfra(config: CliConfig): Promise<void> {
    console.log(chalk.yellow("Provisionnement des ressources Google Cloud via Terraform..."));
    try {
      const { generateTerraformVars } = await import("../terraform-config-generator.js");
      await generateTerraformVars(config);
      const providerDir = "google";
      const terraformDir = path.join(process.cwd(), "infra", providerDir);
  
      // Utilisation de spawnSync avec la commande et les arguments séparés, ce qui évite les problèmes d'échappement.
      const initResult = spawnSync("terraform", ["init"], { cwd: terraformDir, stdio: "inherit", shell: true });
      if (initResult.error) {
        throw initResult.error;
      }
      const applyResult = spawnSync("terraform", ["apply", "-auto-approve"], { cwd: terraformDir, stdio: "inherit", shell: true });
      if (applyResult.error) {
        throw applyResult.error;
      }
      console.log(chalk.green("Ressources Google Cloud provisionnées avec succès."));
    } catch (error) {
      console.error(chalk.red("Erreur lors du provisionnement des ressources Google Cloud:"), error);
      throw error;
    }
  }
  
  async ensureDBUser(config: CliConfig): Promise<void> {
    await ensureDBUserInGoogle(config);
  }
}
