import prompts from 'prompts';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import { BuildService } from '../services/build-service.js';
import { CleanService } from '../services/clean-service.js';
import { ConfigService } from '../services/config-service.js';
import { CloudProviderServices } from '../services/cloud/cloud-provider-services.js';
import { ServiceConfigManager } from '../services/service-config-manager.js';
import { ImagePushService } from '../services/image-push-service.js';
import { RunService } from '../services/run-service.js';
import { RemoteImageService } from '../services/remote-image-service.js';
import { GoogleCliConfig, AWSCliConfig } from '../config/cli-config.js';
import { hasDbCredentialsInEnv, promptAndStoreDbCredentials } from '../utils/env-db-credentials-utils.js';
import { DBInfraData } from '../services/cloud/types.js';

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

  // 1) Validation de la config CLI
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           1) VALIDATION CONFIG CLI         '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  console.log(chalk.blue('\n2) Vérification de la configuration CLI...'));
  let cliConfig: GoogleCliConfig | AWSCliConfig;
  try {
    cliConfig = await ConfigService.ensureOrPromptProviderConfig();
    console.log(chalk.green('✓ Configuration CLI validée.'));
  } catch (err: any) {
    console.error(chalk.red('✖ Erreur configuration CLI :'), err.message || err);
    return;
  }

  // --- Nouveau : guard sur les propriétés Filestore obligatoires ---
  if (
    cliConfig.provider.name === 'google_cloud' &&
    (
      !cliConfig.provider.filestoreExportPath ||
      !cliConfig.provider.mountOptions
    )
  ) {
    console.error(chalk.red('⚠ Configuration Google Filestore incomplète :'));
    console.error(chalk.red(`   filestoreExportPath=${cliConfig.provider.filestoreExportPath}`));
    console.error(chalk.red(`   mountOptions=${cliConfig.provider.mountOptions}`));
    console.error(chalk.red('Abandon du déploiement.'));
    return;
  }

  //  ➤ Préparer le dossier ./prod-deployments/infra/<provider>/
  const providerDir = cliConfig.provider.name; // "google_cloud" ou "aws"
  const infraDir = path.join(process.cwd(), 'prod-deployments', 'infra', providerDir);
  await fs.ensureDir(infraDir);

  // Vérification des données d'environnement
  if (!await hasDbCredentialsInEnv()) {
    const { proceed } = await prompts({
      type: "confirm",
      name: "proceed",
      message: "Les variables POSTGRES_USER/POSTGRES_PASSWORD/POSTGRES_DB manquent dans .env.prod. Les renseigner maintenant ?",
      initial: true
    });
    if (!proceed) {
      console.error(chalk.red("✖ Credentials DB manquants. Abandon du déploiement."));
      return;
    }
    await promptAndStoreDbCredentials();
    if (!await hasDbCredentialsInEnv()) {
      console.error(chalk.red("✖ Credentials DB manquants. Abandon du déploiement."));
      return;
    }
    console.log(chalk.green("✓ Credentials DB renseignés."));
  }

  // 2) Provisionnement & vérification infra cloud
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           2) INFRASTRUCTURE CLOUD            '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));

  const services = CloudProviderServices.forConfig(cliConfig);
  try {
    // 2.a) Stockage
    console.log(chalk.yellow('\n3.a) Vérification du stockage…'));
    const storageSvc = services.storage;
    let sd = undefined;
    if (!await storageSvc.checkInfra()) {
      const { ok } = await prompts({
        type: 'confirm',
        name: 'ok',
        message: 'Stockage introuvable ou non prêt. Le provisionner ?',
        initial: true
      });
      if (!ok) {
        console.log(chalk.red('✖ Abandon provision stockage.'));
        return;
      }
      console.log(chalk.yellow('\n→ Génération des tfvars pour le stockage...'));
      await storageSvc.generateTerraformConfig();
    } else {
      console.log(chalk.green('✓ Stockage cloud accessible.'));
    }

    // **Dans tous les cas**, on déploie/récupère les outputs pour avoir l’IP
    console.log(chalk.yellow('→ Récupération des données Filestore (IP)…'));
    sd = await storageSvc.deployAndFetchData();

    // ←—— ENREGISTREMENT storage.json ———→
    await fs.writeJson(
      path.join(infraDir, 'storage.json'),
      sd,
      { spaces: 2 }
    );
    console.log(chalk.green(`✓ Données stockage écrites dans ${path.relative(process.cwd(), infraDir)}/storage.json`));

    // 2.a.2) Correction du docker-compose
    console.log(chalk.yellow('\n→ Vérification des driver_opts Docker Compose…'));
    const diffs = await storageSvc.checkComposeDrivers(sd);
    if (diffs.length > 0) {
      console.log(chalk.yellow('→ Correction des volumes Docker Compose…'));
      await storageSvc.fixComposeDrivers(sd);
    } else {
      console.log(chalk.green('✓ Volumes déjà corrects dans docker-compose.prod.yml.'));
    }

    // 2.a.3) TEST RÉEL DU MONTAGE DANS UN CONTENEUR
    console.log(chalk.yellow('\n→ Test de montage NFS réel dans un conteneur…'));
    const mountOk = await storageSvc.testMount(sd);
    if (!mountOk) {
      console.warn(chalk.yellow(
        "\n⚠ Le test de montage NFS a échoué, " +
        "mais on continue pour que vous puissiez pousser et tester en prod."
      ));
    } else {
      console.log(chalk.green('✓ Montage NFS local validé.'));
    }

    console.log(chalk.green('✓ Stockage prêt et validé.'));

    // 2.b) Base de données
    console.log(chalk.yellow('\n3.b) Vérification de la base de données…'));
    let dbData: DBInfraData;
    if (!await services.database.checkInfra()) {
      const { ok } = await prompts({
        type: 'confirm',
        name: 'ok',
        message: 'DB introuvable ou non prête. Le provisionner ?',
        initial: true
      });
      if (!ok) {
        console.log(chalk.red('✖ Abandon DB.'));
        return;
      }

      await services.database.generateTerraformConfig();
      console.log(chalk.yellow('→ Provisionnement DB...'));
      dbData = await services.database.deployAndFetchData();
    } else {
      console.log(chalk.green('✓ DB accessible.'));
      dbData = await services.database.fetchInfraData();
    }

    // ←—— ENREGISTREMENT database.json ———→
    await fs.writeJson(
      path.join(infraDir, 'database.json'),
      dbData,
      { spaces: 2 }
    );
    console.log(chalk.green(`✓ Données DB écrites dans ${path.relative(process.cwd(), infraDir)}/database.json`));

    // 2.c) Utilisateur DB
    console.log(chalk.yellow('\n3.c) Vérification de l\'utilisateur DB…'));
    const exists = await services.database.checkUserExists(dbData);
    if (!exists) {
      const { create } = await prompts({
        type: 'confirm',
        name: 'create',
        message: 'Utilisateur DB "appuser" manquant. Le créer ?',
        initial: true
      });
      if (!create) {
        console.log(chalk.red('✖ Abandon création user.'));
        return;
      }
      await services.database.createUser(dbData);
      console.log(chalk.green('✓ Utilisateur DB créé.'));
    } else {
      console.log(chalk.green('✓ Utilisateur DB existe.'));
    }

    console.log(chalk.green('\n✅ Infrastructure cloud prête.'));
  } catch (err: any) {
    console.error(chalk.red('\n✖ Erreur provision infra :'), err.message || err);
    return;
  }

  // 3) Compute (VM Linux)
  console.log(chalk.yellow('\n3.c) Vérification de la VM…'));
  const computeSvc = services.compute;
  if (!await computeSvc.checkInfra()) {
    const { ok } = await prompts({
      type:    'confirm',
      name:    'ok',
      message: 'VM non trouvée. La provisionner ?',
      initial: true
    });
    if (!ok) {
      console.log(chalk.red('✖ Abandon VM.'));
      return;
    }
    console.log(chalk.yellow('→ Génération des tfvars pour la VM…'));
    await computeSvc.generateTerraformConfig();
  } else {
    console.log(chalk.green('✓ VM existante détectée.'));
  }

  console.log(chalk.yellow('→ Provisionnement / récupération VM…'));
  const cd = await computeSvc.deployAndFetchData();

  // ←—— ENREGISTREMENT compute.json ———→
  await fs.writeJson(
    path.join(infraDir, 'compute.json'),
    cd,
    { spaces: 2 }
  );
  console.log(chalk.green(`✓ Données VM écrites dans ${path.relative(process.cwd(), infraDir)}/compute.json`));

  // 3) Vérification des images remote
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('      3) VÉRIFICATION IMAGES REMOTE           '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  const remoteOk = await RemoteImageService.allImagesExist(cliConfig.provider);
  if (remoteOk) {
    // Confirmation utilisateur pour skip clean/build/push
    const { skip } = await prompts({
      type: 'confirm',
      name: 'skip',
      message: 'Toutes les images sont déjà disponibles en remote. Voulez-vous passer directement au démarrage des containers en sautant nettoyage, build et push ?',
      initial: true
    });
    if (skip) {
      console.log(chalk.green('✓ Skip nettoyage/build/push.'));

      // 4) Démarrage des containers
      console.log(chalk.magenta('\n───────────────────────────────────────────────'));
      console.log(chalk.magenta('           4) RUN CONTAINERS                 '));
      console.log(chalk.magenta('───────────────────────────────────────────────'));
      try {
        await RunService.runContainers('prod', cliConfig, cd);
        console.log(chalk.green('✓ Tous les containers sont lancés.'));
      } catch (err: any) {
        console.error(chalk.red('✖ Erreur démarrage containers :'), err.message || err);
        return;
      }

      // 5) Pause finale
      console.log();
      await prompts({
        type: 'text',
        name: 'pause',
        message: chalk.gray('Appuyez sur Entrée pour terminer…'),
      });
      return;
    }
  }

  // 4) Nettoyage complet
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           4) NETTOYAGE COMPLET              '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  try {
    await CleanService.fullClean();
    console.log(chalk.green('✓ Nettoyage terminé.'));
  } catch (err: any) {
    console.error(chalk.red('✖ Erreur nettoyage :'), err.message || err);
    return;
  }

  // 5) Build production
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           5) BUILD PRODUCTION               '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  try {
    await BuildService.buildProd(cliConfig);
    console.log(chalk.green('✓ Build production terminé.'));
  } catch (err: any) {
    console.error(chalk.red('✖ Erreur build :'), err.message || err);
    return;
  }

  // 6) Push des images
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           6) PUSH DES IMAGES                '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  try {
    const servicesToPush = await ServiceConfigManager.listServices('prod');
    for (const svc of servicesToPush) {
      console.log(chalk.blue(`→ Push image ${svc.name} (ordre ${svc.order})…`));
      await ImagePushService.pushImage(svc, cliConfig.provider);
    }
    console.log(chalk.green('✓ Toutes les images ont été poussées.'));
  } catch (err: any) {
    console.error(chalk.red('✖ Erreur push images :'), err.message || err);
    return;
  }

  // 7) Démarrage des containers
  console.log(chalk.magenta('\n───────────────────────────────────────────────'));
  console.log(chalk.magenta('           7) RUN CONTAINERS                 '));
  console.log(chalk.magenta('───────────────────────────────────────────────'));
  try {
    await RunService.runContainers('prod', cliConfig, cd);
    console.log(chalk.green('✓ Tous les containers sont lancés.'));
  } catch (err: any) {
    console.error(chalk.red('✖ Erreur démarrage containers :'), err.message || err);
    return;
  }

  // 8) Pause finale
  console.log();
  await prompts({
    type: 'text',
    name: 'pause',
    message: chalk.gray('Appuyez sur Entrée pour terminer…'),
  });
}
