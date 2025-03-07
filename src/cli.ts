#!/usr/bin/env node
// Ne pas retirer : c'est une directive pour Node.js 
// Permet d'exécuter ce fichier sans préciser "node" dans le terminal.

import { Command } from 'commander';
import { createCommand } from './commands/create';
import { configCommand } from './commands/config';
import { buildCommand } from './commands/build';
import { cleanCommand } from './commands/clean';
import { monitorCommand } from './commands/monitor';
import { helpersCommand } from './commands/helpers';
import { doctorCommand } from './commands/doctor';

const program = new Command();

program
  .name('appwizard')
  .description('🧙‍♂️ CLI pour gérer efficacement votre projet NestJS/Angular.')
  .version('0.0.1', '-v, --version', 'Affiche la version actuelle du CLI');

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
