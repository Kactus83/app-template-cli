import { execSync } from 'child_process';
import axios from 'axios';
import chalk from 'chalk';

/**
 * Vérifie les prérequis techniques nécessaires au bon fonctionnement du projet.
 *
 * @remarks
 * Cette commande teste dans l’ordre :
 * - Connexion internet
 * - Installation et disponibilité de Git
 * - Accessibilité du dépôt GitHub du template
 * - Disponibilité de Docker
 * - Disponibilité de Docker Compose
 *
 * En cas d’échec, elle fournit des indications précises pour résoudre les problèmes détectés.
 *
 * @author Kactus83
 */
export async function doctorCommand(): Promise<void> {
  console.log(chalk.blue('🩺 Vérification des prérequis en cours...\n'));

  const results = {
    internet: false,
    git: false,
    repo: false,
    docker: false,
    dockerCompose: false,
  };

  // Test de la connexion internet
  try {
    await axios.get('https://google.com', { timeout: 5000 });
    results.internet = true;
    console.log(chalk.green('✅ Connexion internet fonctionnelle'));
  } catch {
    console.log(chalk.red('❌ Impossible de se connecter à internet'));
  }

  // Vérification de l’installation de Git
  try {
    execSync('git --version', { stdio: 'ignore' });
    results.git = true;
    console.log(chalk.green('✅ Git est installé et disponible'));
  } catch {
    console.log(chalk.red('❌ Git n’est pas installé ou introuvable'));
  }

  // Vérification de l’accès au dépôt GitHub
  try {
    await axios.get('https://github.com/Kactus83/app-template', { timeout: 5000 });
    results.repo = true;
    console.log(chalk.green('✅ Accès au dépôt GitHub validé'));
  } catch {
    console.log(chalk.red('❌ Impossible d’accéder au dépôt GitHub "app-template"'));
  }

  // Vérification de l’installation de Docker
  try {
    execSync('docker --version', { stdio: 'ignore' });
    results.docker = true;
    console.log(chalk.green('✅ Docker est installé et disponible'));
  } catch {
    console.log(chalk.red('❌ Docker n’est pas installé ou introuvable'));
  }

  // Vérification de Docker Compose
  try {
    execSync('docker-compose --version', { stdio: 'ignore' });
    results.dockerCompose = true;
    console.log(chalk.green('✅ Docker Compose est installé et disponible'));
  } catch {
    console.log(chalk.red('❌ Docker Compose n’est pas installé ou introuvable'));
  }

  // Rapport final clair et précis
  console.log('\n', chalk.bold.blue('📋 Rapport de vérification :'));
  Object.entries(results).forEach(([key, value]) => {
    console.log(`- ${key} : ${value ? chalk.green('OK') : chalk.red('ÉCHEC')}`);
  });

  // Conseils précis en cas d’échec
  if (!results.internet) {
    console.log(chalk.yellow('\n➡️ Vérifiez votre connexion internet et votre pare-feu.'));
  }
  if (!results.git) {
    console.log(chalk.yellow('\n➡️ Installez Git : https://git-scm.com/downloads'));
  }
  if (!results.repo) {
    console.log(chalk.yellow('\n➡️ Vérifiez votre accès à GitHub ou l’URL du dépôt.'));
  }
  if (!results.docker) {
    console.log(chalk.yellow('\n➡️ Installez Docker : https://docs.docker.com/get-docker/'));
  }
  if (!results.dockerCompose) {
    console.log(chalk.yellow('\n➡️ Installez Docker Compose : https://docs.docker.com/compose/install/'));
  }

  // Message de succès global
  if (Object.values(results).every(Boolean)) {
    console.log(chalk.bold.green('\n🎉 Tout est opérationnel ! Vous êtes prêt à lancer votre projet !'));
  } else {
    console.log(chalk.bold.red('\n❗ Veuillez corriger les erreurs ci-dessus avant de continuer.'));
  }
}
