import prompts from 'prompts';
import chalk from 'chalk';

export async function deployCommand(): Promise<void> {
  console.clear();
  console.log(chalk.yellow('======================================'));
  console.log(chalk.yellow('         DEPLOY OPTIONS (PROD)        '));
  console.log(chalk.yellow('======================================\n'));

  // 0) Confirmation globale
  const { confirm } = await prompts({
    type: 'confirm',
    name: 'confirm',
    message: '1) Confirmez-vous le déploiement en production ?',
    initial: false
  });
  if (!confirm) {
    console.log(chalk.red('\n✖ Déploiement annulé.'));
    return;
  }

  // 8) Pause finale
  console.log();
  await prompts({
    type: 'text',
    name: 'pause',
    message: chalk.gray('Fonctionnalite actuellement indisponible. Appuyez sur Entrée pour terminer…'),
  });
}
