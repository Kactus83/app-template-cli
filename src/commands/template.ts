import { TemplateService } from '../services/template-service.js';
import prompts from 'prompts';
import chalk from 'chalk';


export async function templateCommand(): Promise<void> {
  try {
    console.log(chalk.blue('=== Informations du Template ==='));
    const templateConfig = await TemplateService.loadTemplateConfig();
    console.log(chalk.green('Nom:'), templateConfig.name);
    console.log(chalk.green('Version:'), templateConfig.version);
    console.log(chalk.green('Description:'), templateConfig.description);

    const choices = [
      { title: 'Afficher les infos du template', value: 'templateInfo' },
      { title: 'Afficher le listing des services avec leurs détails', value: 'servicesList' },
    ];

    const response = await prompts({
      type: 'select',
      name: 'choice',
      message: 'Que souhaitez-vous afficher ?',
      choices,
      initial: 0,
    });

    if (response.choice === 'templateInfo') {
      console.log(chalk.blue('\n=== Détails du Template ==='));
      console.log(JSON.stringify(templateConfig, null, 2));
    } else if (response.choice === 'servicesList') {
      console.log(chalk.blue('\n=== Listing des Services ==='));
      const services = await TemplateService.listServices();
      if (services.length === 0) {
        console.log(chalk.yellow('Aucun service trouvé.'));
      } else {
        services.forEach((service) => {
          console.log(chalk.green(`Service: ${service.name}`));
          console.log(`  Prod Address: ${service.prodAddress || 'Non défini'}`);
          console.log('');
        });
      }
    } else {
      console.log(chalk.yellow('Opération annulée.'));
    }
  } catch (error) {
    console.error(chalk.red('Erreur lors de l\'exécution de la commande template:'), error);
  }
}