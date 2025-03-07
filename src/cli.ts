#!/usr/bin/env node
import { Command } from 'commander';
import { createCommand } from './commands/create';
import { configCommand } from './commands/config';
import { buildCommand } from './commands/build';
import { cleanCommand } from './commands/clean';
import { monitorCommand } from './commands/monitor';
import { helpersCommand } from './commands/helpers';

const program = new Command();

program
  .name('appwizard')
  .description('CLI pour gérer votre projet Nest/Angular')
  .version('0.0.1');

// Commande "create"
program
  .command('create')
  .description('Crée le fichier de configuration et le template si inexistant')
  .action(() => {
    createCommand();
  });

// Commande "config"
program
  .command('config')
  .description('Affiche et permet d’éditer la configuration du projet')
  .action(() => {
    configCommand();
  });

// Commande "build"
program
  .command('build')
  .description('Lance le processus de build (avec ou sans options)')
  .action(() => {
    buildCommand();
  });

// Commande "clean"
program
  .command('clean')
  .description('Nettoie le projet (mode normal ou forcé)')
  .action(() => {
    cleanCommand();
  });

// Commande "monitor"
program
  .command('monitor')
  .description('Surveille l’état des conteneurs et permet leur redémarrage')
  .action(() => {
    monitorCommand();
  });

// Commande "helpers"
program
  .command('helpers')
  .description('Accède aux outils d’aide (upgrade, check, tests, etc.)')
  .action(() => {
    helpersCommand();
  });

program.parse(process.argv);
