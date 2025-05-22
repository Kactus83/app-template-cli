#!/usr/bin/env node
/**
 * @module commands/create
 * Commande `appwizard create` :
 * 1) vérifie qu’un ServiceAccount est configuré,
 * 2) permet de choisir un dossier,
 * 3) liste les templates,
 * 4) télécharge et déploie le template choisi,
 * 5) initialise / commit Git.
 */

import fs from 'fs-extra';
import * as path from 'path';
import prompts from 'prompts';
import { AuthService } from '../services/auth-service.js';
import { FetchTemplateService } from '../services/fetch-template-service.js';
import { GitService } from '../services/git-service.js';
import type { Template } from '../types/template.js';

// Ne pas supprimer ces fichiers lors du nettoyage
const ALLOWED_FILES = ['.git', '.vscode', '.DS_Store'];

async function cleanTargetDirectory(dir: string): Promise<void> {
  const entries = await fs.readdir(dir);
  for (const e of entries) {
    if (!ALLOWED_FILES.includes(e)) {
      await fs.remove(path.join(dir, e));
    }
  }
}

async function chooseTargetDirectory(cwd: string): Promise<string> {
  const resp = await prompts({
    type: 'select',
    name: 'option',
    message: 'Où créer le projet ?',
    choices: [
      { title: 'Dossier courant',       value: 'current' },
      { title: 'Nouveau sous-dossier',  value: 'subfolder' },
    ],
    initial: 0,
  });
  const option = resp.option as 'current' | 'subfolder';

  if (option === 'current') {
    console.log(`⚠️ Nettoyage de ${cwd} (sauf ${ALLOWED_FILES.join(', ')})`);
    await cleanTargetDirectory(cwd);
    return cwd;
  } else {
    const { folderName } = await prompts({
      type: 'text',
      name: 'folderName',
      message: 'Nom du sous-dossier :',
      initial: 'mon-projet',
      validate: v => v.trim() ? true : 'Ne peut pas être vide'
    });
    const target = path.join(cwd, (folderName as string).trim());
    if (await fs.pathExists(target)) {
      console.error(`❌ Le dossier ${target} existe déjà.`);
      process.exit(1);
    }
    await fs.mkdir(target);
    return target;
  }
}

export async function createCommand(): Promise<void> {
  // 1) Auth check
  const auth = new AuthService();
  if (!(await auth.getServiceAccount())) {
    console.error('❌ Aucun Service Account configuré. Lancez `appwizard login` d’abord.');
    process.exit(1);
  }

  // 2) Choix du dossier
  const cwd       = process.cwd();
  const targetDir = await chooseTargetDirectory(cwd);

  // 3) Liste des templates
  const templates = await FetchTemplateService.listTemplates();
  if (templates.length === 0) {
    console.error('❌ Aucun template disponible.');
    process.exit(1);
  }

  // 4) Sélection
  const sel = await prompts({
    type: 'select',
    name: 'chosen',
    message: 'Sélectionnez un template :',
    choices: templates.map(t => ({ title: t.name, value: t })),
    initial: 0,
  });
  const chosen = sel.chosen as Template;
  if (!chosen) return;

  // 5) Déploiement
  await FetchTemplateService.fetchTemplate(chosen.id, targetDir);

  // 6) Git init/commit
  if (GitService.isGitInstalled()) {
    await GitService.handleRepository(targetDir, `Initialisation du projet ${chosen.name}`);
  } else {
    console.warn('⚠️ Git non installé, skip.');
  }

  console.log(`🎉 Projet "${chosen.name}" prêt dans ${targetDir} !`);
}
