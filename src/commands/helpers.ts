import { execSync } from 'child_process';
import axios from 'axios';
import chalk from 'chalk';
import prompts from 'prompts';

/**
 * Vérifie la connexion Internet en tentant d'accéder à google.com.
 *
 * @returns Promise<boolean> Vrai si la connexion fonctionne.
 */
export async function checkInternet(): Promise<boolean> {
  try {
    await axios.get('https://google.com', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie si Git est installé en exécutant "git --version".
 *
 * @returns boolean Vrai si Git est disponible.
 */
export function checkGit(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie l'accès au dépôt GitHub "app-template".
 *
 * @returns Promise<boolean> Vrai si le dépôt est accessible.
 */
export async function checkRepo(): Promise<boolean> {
  try {
    await axios.get('https://github.com/Kactus83/app-template', { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie si Docker est installé en exécutant "docker --version".
 *
 * @returns boolean Vrai si Docker est disponible.
 */
export function checkDocker(): boolean {
  try {
    execSync('docker --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Vérifie si Docker Compose est installé en exécutant "docker-compose --version".
 *
 * @returns boolean Vrai si Docker Compose est disponible.
 */
export function checkDockerCompose(): boolean {
  try {
    execSync('docker-compose --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Ouvre une URL dans le navigateur par défaut, selon le système.
 *
 * @param url L'URL à ouvrir.
 */
export function openUrl(url: string): void {
  const platform = process.platform;
  try {
    if (platform === 'win32') {
      execSync(`start "" "${url}"`);
    } else if (platform === 'darwin') {
      execSync(`open "${url}"`);
    } else {
      execSync(`xdg-open "${url}"`);
    }
  } catch (error) {
    console.error(chalk.red(`Erreur lors de l'ouverture de ${url}:`), error);
  }
}

/**
 * Ouvre les fenêtres web du projet dans le navigateur par défaut.
 *
 * Les URL ouvertes sont :
 * - Mailhog : http://localhost:8025
 * - Frontend : http://localhost:4200
 * - Documentation Typedocs du backend : http://localhost:3000/docs
 * - Swagger : http://localhost:3000/api-docs
 */
export function openWebPages(): void {
  console.log(chalk.blue('\nOuverture des fenêtres web du projet...'));
  openUrl('http://localhost:8025');  // Mailhog
  openUrl('http://localhost:4200');   // Frontend
  openUrl('http://localhost:3000/docs');  // Documentation
  openUrl('http://localhost:3000/api-docs'); // Swagger
  console.log(chalk.green('✅ Les fenêtres web ont été ouvertes.'));
}

/**
 * Exécute un diagnostic complet de l'environnement et affiche les résultats avec des conseils.
 *
 * @returns Promise<void> Une fois le diagnostic terminé.
 */
export async function runDetailedDiagnostic(): Promise<void> {
  console.clear();
  console.log(chalk.magenta('🔍 Diagnostic détaillé de l\'environnement\n'));
  
  const internet = await checkInternet();
  const git = checkGit();
  const repo = await checkRepo();
  const docker = checkDocker();
  const dockerCompose = checkDockerCompose();
  
  console.log(`Connexion Internet : ${internet ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Git                : ${git ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Dépôt GitHub       : ${repo ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker             : ${docker ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  console.log(`Docker Compose     : ${dockerCompose ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  
  // Conseils détaillés en cas d'échec
  if (!internet) {
    console.log(chalk.yellow('→ Vérifiez votre connexion internet et vos paramètres réseau.'));
  }
  if (!git) {
    console.log(chalk.yellow('→ Installez Git depuis : https://git-scm.com/downloads'));
  }
  if (!repo) {
    console.log(chalk.yellow('→ Vérifiez votre accès à GitHub ou l\'URL du dépôt "app-template".'));
  }
  if (!docker) {
    console.log(chalk.yellow('→ Installez Docker depuis : https://docs.docker.com/get-docker/'));
  }
  if (!dockerCompose) {
    console.log(chalk.yellow('→ Installez Docker Compose depuis : https://docs.docker.com/compose/install/'));
  }
  
  if (internet && git && repo && docker && dockerCompose) {
    console.log(chalk.bold.green('\n🎉 Diagnostic : Tout est opérationnel.'));
  } else {
    console.log(chalk.bold.red('\n❗ Diagnostic : Certains prérequis ne sont pas satisfaits.'));
  }
  
  await prompts({
    type: 'text',
    name: 'pause',
    message: 'Appuyez sur Entrée pour continuer...',
  });
}

/**
 * Commande interactive "helpers" proposant deux options principales :
 * 1. Effectuer un diagnostic complet de l'environnement (similaire à doctor).
 * 2. Ouvrir interactivement les fenêtres web du projet (choix pour chaque fenêtre).
 *
 * @returns Promise<void> Une fois l'opération terminée.
 */
export async function helpersCommand(): Promise<void> {
  console.clear();
  console.log(chalk.magenta('🔧 Menu Helpers - Outils d\'assistance\n'));
  
  const response = await prompts({
    type: 'select',
    name: 'option',
    message: 'Que souhaitez-vous faire ?',
    choices: [
      { title: '1. Effectuer un diagnostic complet de l\'environnement', value: 'diagnostic' },
      { title: '2. Ouvrir interactivement les fenêtres web du projet', value: 'openWeb' },
      { title: '3. Retour', value: 'return' }
    ]
  });
  
  if (response.option === 'diagnostic') {
    await runDetailedDiagnostic();
  } else if (response.option === 'openWeb') {
    // Option interactive pour ouvrir chaque fenêtre
    console.clear();
    console.log(chalk.magenta('🌐 Ouverture interactive des fenêtres web\n'));
    
    const pages = [
      { title: 'Mailhog (http://localhost:8025)', url: 'http://localhost:8025' },
      { title: 'Frontend (http://localhost:4200)', url: 'http://localhost:4200' },
      { title: 'Documentation (http://localhost:3000/docs)', url: 'http://localhost:3000/docs' },
      { title: 'Swagger (http://localhost:3000/api-docs)', url: 'http://localhost:3000/api-docs' },
    ];
    
    for (const page of pages) {
      const res = await prompts({
        type: 'confirm',
        name: 'open',
        message: `Voulez-vous ouvrir ${page.title} ?`,
        initial: true,
      });
      if (res.open) {
        openUrl(page.url);
        console.log(chalk.green(`✅ ${page.title} ouvert.`));
      } else {
        console.log(chalk.yellow(`→ ${page.title} non ouvert.`));
      }
    }
    
    await prompts({
      type: 'text',
      name: 'pause',
      message: 'Appuyez sur Entrée pour continuer...',
    });
  } else {
    console.log(chalk.green('\nRetour au menu principal.'));
  }
}
