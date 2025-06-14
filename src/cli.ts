#!/usr/bin/env node
// Ne pas retirer : c'est une directive pour Node.js 
// Permet d'exécuter ce fichier sans préciser "node" dans le terminal.

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { configCommand } from './commands/config.js';
import { buildCommand } from './commands/build.js';
import { cleanCommand } from './commands/clean.js';
import { monitorCommand } from './commands/monitor.js';
import { helpersCommand } from './commands/helpers.js';
import { doctorCommand } from './commands/doctor.js';
import { credentialsCommand } from './commands/credentials.js';
import { templateCommand } from './commands/template.js';
import { deployCommand } from './commands/deploy.js';
import { devRunCommand } from './commands/dev-run.js';
import { log } from 'console';
import { loginCommand } from './commands/login.js';


const program = new Command();

program
  .name('appwizard')
  .description('🧙‍♂️ CLI pour gérer efficacement votre projet NestJS/Angular.')
  .version('0.0.1', '-v, --version', 'Affiche la version actuelle du CLI');

// Commande "login"
program
  .command('login')
  .description('🔑 Authentification et gestion des credentials utilisateur.')
  .action(loginCommand);

// Commande "create"
program
  .command('create')
  .description('✨ Crée un nouveau projet à partir du template officiel.')
  .action(createCommand);

// Commande "config"
program
  .command('config')
  .description('⚙️  Affiche et permet de modifier la configuration du projet.')
  .action(configCommand);

// Commande "build"
program
  .command('build')
  .description('🚧 Lance le processus de build (menu interactif par défaut).')
  .action(buildCommand);

// Commande "dev run"
program
  .command('dev-run')
  .description('🏃‍♂️ Lance les conteneurs Docker en mode développement.')
  .action(devRunCommand);

// Commande "deploy"
program
  .command('deploy')
  .description('🚀 Déploie le projet (menu interactif par défaut).')
  .action(deployCommand);

// Commande "clean"
program
  .command('clean')
  .description('🧹 Lance le nettoyage du projet (menu interactif par défaut).')
  .action(cleanCommand);

// Commande "monitor"
program
  .command('monitor')
  .description('📈 Surveille les conteneurs Docker et permet de les gérer.')
  .action(monitorCommand);

// Commande "helpers"
program
  .command('helpers')
  .description('🔧 Outils d’aide et de réparation du projet.')
  .action(helpersCommand);

// Commande "doctor"
program
  .command('doctor')
  .description('🩺 Vérifie que tous les prérequis techniques sont satisfaits.')
  .action(doctorCommand);

// Commande "remove credentials"
program
  .command('credentials')
  .description('🔑 Utilitaire pour les credentials utilisateur.')
  .action(credentialsCommand);

// Commande en liens avec les infos du template
program
  .command('template')
  .description('📄 Affiche les informations du template et le listing des services.')
  .action(templateCommand);

// Personnalisation du message d'aide général
program.configureHelp({
  sortSubcommands: true,
  subcommandTerm: (cmd) => cmd.name().padEnd(12),
});

program.addHelpText('after', `
Exemples d'utilisation:
  $ appwizard create
  $ appwizard build
  $ appwizard doctor
`);

program.parse(process.argv);
