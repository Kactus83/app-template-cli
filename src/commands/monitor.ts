import { execSync } from 'child_process';
import prompts from 'prompts';
import chalk from 'chalk';

/**
 * Commande CLI interactive permettant de gérer facilement les conteneurs Docker du projet.
 *
 * @remarks
 * Cette commande propose un menu interactif offrant les fonctionnalités suivantes :
 * - Redémarrer un conteneur
 * - Reconstruire (rebuild) et redémarrer un conteneur
 * - Arrêter un conteneur
 * - Afficher les logs d'un conteneur
 * - Inspecter un conteneur (accès au shell)
 *
 * L'utilisateur est guidé clairement à chaque étape.
 *
 * @author Kactus83
 */
export async function monitorCommand(): Promise<void> {
  while (true) {
    console.clear();
    console.log(chalk.cyan('🐳 Utilitaire Docker - Gestion interactive des conteneurs\n'));

    const { action } = await prompts({
      type: 'select',
      name: 'action',
      message: 'Que souhaitez-vous faire ?',
      choices: [
        { title: '🔄 Redémarrer un conteneur', value: 'restart' },
        { title: '♻️ Reconstruire et redémarrer un conteneur', value: 'rebuild' },
        { title: '⏹️  Arrêter un conteneur', value: 'stop' },
        { title: '📄 Voir les logs d\'un conteneur', value: 'logs' },
        { title: '🔍 Inspecter un conteneur (shell)', value: 'inspect' },
        { title: '🚪 Quitter', value: 'quit' },
      ],
    });

    if (action === 'quit' || action === undefined) {
      console.log(chalk.green('👋 Au revoir et bonne journée !'));
      break;
    }

    // Récupération des conteneurs disponibles
    const containers = getAvailableContainers();
    if (containers.length === 0) {
      console.log(chalk.red('❌ Aucun conteneur disponible.'));
      await pause();
      continue;
    }

    const { container } = await prompts({
      type: 'select',
      name: 'container',
      message: 'Sélectionnez un conteneur :',
      choices: containers.map(name => ({ title: name, value: name })),
    });

    try {
      switch (action) {
        case 'restart':
          execSync(`docker-compose restart ${container}`, { stdio: 'inherit' });
          console.log(chalk.green(`✅ Le conteneur "${container}" a été redémarré.`));
          break;

        case 'rebuild':
          execSync(`docker-compose stop ${container}`, { stdio: 'inherit' });
          execSync(`docker-compose rm -f ${container}`, { stdio: 'inherit' });
          execSync(`docker-compose up --build -d ${container}`, { stdio: 'inherit' });
          console.log(chalk.green(`✅ Le conteneur "${container}" a été reconstruit et redémarré.`));
          break;

        case 'stop':
          execSync(`docker-compose stop ${container}`, { stdio: 'inherit' });
          console.log(chalk.green(`✅ Le conteneur "${container}" a été arrêté.`));
          break;

        case 'logs':
          console.log(chalk.blue(`📄 Logs en direct du conteneur "${container}". (Ctrl+C pour quitter)`));
          execSync(`docker-compose logs -f ${container}`, { stdio: 'inherit' });
          break;

        case 'inspect':
          console.log(chalk.blue(`🔍 Shell du conteneur "${container}". Tapez "exit" pour quitter.`));
          execSync(`docker-compose exec ${container} sh`, { stdio: 'inherit' });
          break;
      }
    } catch (error) {
      console.error(chalk.red(`❌ Erreur durant l'exécution : ${error}`));
    }

    await pause();
  }
}

/**
 * Récupère la liste des conteneurs disponibles via Docker Compose.
 *
 * @returns Liste des conteneurs Docker disponibles.
 */
function getAvailableContainers(): string[] {
  try {
    const output = execSync('docker-compose ps --services', { encoding: 'utf-8' });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Met en pause le script pour permettre à l'utilisateur de lire les résultats.
 */
async function pause(): Promise<void> {
  await prompts({
    type: 'confirm',
    name: 'value',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}
