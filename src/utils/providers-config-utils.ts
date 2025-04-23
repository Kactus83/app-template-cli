import prompts from 'prompts';
import chalk from 'chalk';
import { Provider, InfraPerformance } from '../config/cli-config.js';

export interface CommonConfig {
  providerName?: Provider;
  artifactRegistry?: string;
  performance?: InfraPerformance;
}

/**
 * Prompt les champs communs : providerName, artifactRegistry, performance.
 * Ne redemande que ce qui manque ou que l'utilisateur choisit de modifier.
 */
export async function promptCommonProviderConfig(
  existing: CommonConfig = {}
): Promise<Required<CommonConfig>> {
  let { providerName, artifactRegistry, performance } = existing;

  // 1) Provider
  if (providerName) {
    console.log(chalk.cyan(`→ Provider actuel : ${providerName}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce provider ?',
      initial: true
    });
    if (!reuse) providerName = undefined;
  }
  if (!providerName) {
    const resp = await prompts({
      type: 'select',
      name: 'providerName',
      message: 'Sélectionnez votre provider :',
      choices: [
        { title: 'Google Cloud', value: Provider.GOOGLE_CLOUD },
        { title: 'AWS',           value: Provider.AWS }
      ]
    });
    providerName = resp.providerName;
  }

  // 2) Artifact Registry
  if (artifactRegistry) {
    console.log(chalk.cyan(`→ Registry actuel : ${artifactRegistry}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver cette registry ?',
      initial: true
    });
    if (!reuse) artifactRegistry = undefined;
  }
  if (!artifactRegistry) {
    const resp = await prompts({
      type: 'text',
      name: 'artifactRegistry',
      message: "Entrez l'URL ou l'ID de votre registry d'artifacts :",
      validate: v => v.trim() ? true : 'Ne peut pas être vide'
    });
    artifactRegistry = resp.artifactRegistry.trim();
  }

  // 3) Performance
  if (performance) {
    console.log(chalk.cyan(`→ Performance actuelle : ${performance}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce niveau de performance ?',
      initial: true
    });
    if (!reuse) performance = undefined;
  }
  if (!performance) {
    const resp = await prompts({
      type: 'select',
      name: 'performance',
      message: 'Sélectionnez le niveau de performance :',
      choices: [
        { title: 'Low',    value: InfraPerformance.LOW    },
        { title: 'Medium', value: InfraPerformance.MEDIUM },
        { title: 'High',   value: InfraPerformance.HIGH   },
      ]
    });
    performance = resp.performance;
  }

  return {
    providerName: providerName!,
    artifactRegistry: artifactRegistry!,
    performance: performance!
  };
}
