import prompts from 'prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { AWSProviderConfig } from '../config/cli-config.js';

/**
 * Prompt les champs AWS pour EFS **et** pour la VM EC2 :
 * - subnetId, securityGroups, filestoreExportPath, mountOptions
 * - computeKeyName        (nom de la key-pair AWS)
 * - computePublicKeyPath  (chemin vers votre clé privée .pem)
 *
 * On ne redemande que si l’utilisateur veut modifier ou si c’est absent.
 */
export async function promptAWSConfig(
  existing: Partial<AWSProviderConfig> = {}
): Promise<Pick<
  AWSProviderConfig,
  | 'subnetId'
  | 'securityGroups'
  | 'filestoreExportPath'
  | 'mountOptions'
  | 'computeKeyName'
  | 'computePublicKeyPath'
>> {
  let {
    subnetId,
    securityGroups,
    filestoreExportPath,
    mountOptions,
    computeKeyName,
    computePublicKeyPath
  } = existing;

  //
  // 1) subnetId
  //
  if (subnetId) {
    console.log(chalk.cyan(`→ Subnet ID actuel : ${subnetId}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce Subnet ID ?',
      initial: true
    });
    if (!reuse) subnetId = undefined;
  }
  if (!subnetId) {
    const { subnetId: s } = await prompts({
      type: 'text',
      name: 'subnetId',
      message: "Entrez l'ID du subnet pour AWS :",
      validate: v => v.trim() ? true : 'Ne peut pas être vide'
    });
    subnetId = s.trim();
  }

  //
  // 2) securityGroups
  //
  if (securityGroups && securityGroups.length) {
    console.log(chalk.cyan(`→ SecurityGroups actuels : ${securityGroups.join(',')}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ces Security Groups ?',
      initial: true
    });
    if (!reuse) securityGroups = undefined;
  }
  if (!securityGroups || !securityGroups.length) {
    const { securityGroups: sg } = await prompts({
      type: 'list',
      name: 'securityGroups',
      message: 'Entrez les IDs des groupes de sécurité (séparés par des virgules) :',
      separator: ',',
      validate: arr => arr.length ? true : 'Au moins un groupe requis'
    });
    securityGroups = sg;
  }

  //
  // 3) filestoreExportPath
  //
  if (filestoreExportPath) {
    console.log(chalk.cyan(`→ Chemin export EFS actuel : ${filestoreExportPath}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce chemin d’export ?',
      initial: true
    });
    if (!reuse) filestoreExportPath = undefined;
  }
  if (!filestoreExportPath) {
    const { filestoreExportPath: f } = await prompts({
      type: 'text',
      name: 'filestoreExportPath',
      message: 'Chemin d’export pour EFS :',
      initial: '/',
      validate: v => v.startsWith('/') ? true : 'Doit commencer par "/"'
    });
    filestoreExportPath = f;
  }

  //
  // 4) mountOptions
  //
  if (mountOptions) {
    console.log(chalk.cyan(`→ Options montage EFS actuelles : ${mountOptions}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ces options de montage ?',
      initial: true
    });
    if (!reuse) mountOptions = undefined;
  }
  if (!mountOptions) {
    const { mountOptions: m } = await prompts({
      type: 'text',
      name: 'mountOptions',
      message: 'Options de montage EFS (ex: rw,nosuid,hard,timeo=600) :',
      initial: 'rw,nosuid,hard,timeo=600',
      validate: v => v.split(',').length > 0 ? true : 'Au moins une option requise'
    });
    mountOptions = m;
  }

  //
  // 5) computeKeyName
  //
  if (computeKeyName) {
    console.log(chalk.cyan(`→ Key-pair AWS actuelle : ${computeKeyName}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce nom de key-pair pour EC2 ?',
      initial: true
    });
    if (!reuse) computeKeyName = undefined;
  }
  if (!computeKeyName) {
    const { computeKeyName: k } = await prompts({
      type: 'text',
      name: 'computeKeyName',
      message: 'Entrez le nom de la key-pair AWS (doit exister) :',
      validate: v => v.trim() ? true : 'Ne peut pas être vide'
    });
    computeKeyName = k.trim();
  }

  //
  // 6) computePublicKeyPath
  //
  if (computePublicKeyPath) {
    console.log(chalk.cyan(`→ Chemin vers clé privée actuel : ${computePublicKeyPath}`));
    const { reuse } = await prompts({
      type: 'confirm',
      name: 'reuse',
      message: 'Conserver ce chemin de clé privée ?',
      initial: true
    });
    if (!reuse) computePublicKeyPath = undefined;
  }
  if (!computePublicKeyPath) {
    const { computePublicKeyPath: p } = await prompts({
      type: 'text',
      name: 'computePublicKeyPath',
      message: 'Chemin vers votre fichier PEM (clé privée) :',
      initial: path.join(process.env.HOME || '', '.ssh', 'id_rsa.pem'),
      validate: v => fs.existsSync(v.trim()) ? true : 'Fichier introuvable'
    });
    computePublicKeyPath = p.trim();
  }

  return {
    subnetId:             subnetId!,
    securityGroups:       securityGroups!,
    filestoreExportPath:  filestoreExportPath!,
    mountOptions:         mountOptions!,
    computeKeyName:       computeKeyName!,
    computePublicKeyPath: computePublicKeyPath!
  };
}
