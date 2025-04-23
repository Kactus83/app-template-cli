import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

/**
 * Extrait les outputs de Terraform au format JSON.
 * On suppose que le répertoire d'infrastructure est situé dans "infra/google".
 */
async function getTerraformOutputs(): Promise<Record<string, any>> {
  const terraformDir = path.join(process.cwd(), "infra", "google");
  try {
    const outputJson = execSync("terraform output -json", { cwd: terraformDir, encoding: "utf8" });
    return JSON.parse(outputJson);
  } catch (error) {
    console.error(chalk.red("Erreur lors de l'extraction des outputs Terraform:"), error);
    throw error;
  }
}

/**
 * Met à jour le fichier .env.prod avec les valeurs extraites depuis les outputs Terraform.
 *
 * Les clés mises à jour sont :
 *   - DATABASE_URL (construite à partir de cloud_sql_public_ip ou cloud_sql_connection_name)
 *   - POSTGRES_USER
 *   - POSTGRES_PASSWORD
 *   - POSTGRES_DB
 *
 * La fonction lit d'abord le fichier existant (ou crée un squelette s'il n'existe pas),
 * ensuite met à jour (ou ajoute) ces clés avant de réécrire le fichier.
 */
export async function updateEnvProdFromTerraform(): Promise<void> {
  try {
    const outputs = await getTerraformOutputs();

    // On récupère les outputs pertinents (ils doivent être définis dans votre configuration Terraform via output)
    const publicIp: string | undefined = outputs.cloud_sql_public_ip?.value;
    const connectionName: string | undefined = outputs.cloud_sql_connection_name?.value;

    // Définir des valeurs par défaut pour le user, le mot de passe et le nom de la DB.
    // Vous pouvez les adapter selon vos exigences.
    const defaultUser = "my_user";
    const defaultPassword = "my_password";
    const defaultDb = "my_database";
    
    // Construction de DATABASE_URL.
    // Priorité donnée à l'IP publique, sinon on utilise le connection name pour une connexion par socket.
    let databaseUrl = "";
    if (publicIp) {
      databaseUrl = `postgresql://${defaultUser}:${defaultPassword}@${publicIp}:5432/${defaultDb}?schema=public`;
    } else if (connectionName) {
      databaseUrl = `postgresql://${defaultUser}:${defaultPassword}@/${defaultDb}?host=/cloudsql/${connectionName}`;
    } else {
      console.warn(chalk.yellow("Aucune information de connexion (public IP ou connection name) n'a été retournée par Terraform."));
    }
    
    // Chemin du fichier .env.prod
    const envProdPath = path.join(process.cwd(), ".env.prod");
    let envContent = "";
    if (await fs.pathExists(envProdPath)) {
      envContent = await fs.readFile(envProdPath, "utf8");
    } else {
      console.log(chalk.blue("Le fichier .env.prod n'existe pas, création d'un squelette."));
      envContent = "# Fichier généré automatiquement. Veuillez renseigner les valeurs nécessaires.\n";
    }
    
    // Convertir le fichier .env.prod en un objet clé/valeur
    const envMap: Record<string, string> = {};
    envContent.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
        const [key, ...rest] = trimmed.split("=");
        envMap[key] = rest.join("=").trim();
      }
    });
    
    // Mettre à jour/ajouter les clés nécessaires
    envMap["DATABASE_URL"] = databaseUrl;
    envMap["POSTGRES_USER"] = envMap["POSTGRES_USER"] || defaultUser;
    envMap["POSTGRES_PASSWORD"] = envMap["POSTGRES_PASSWORD"] || defaultPassword;
    envMap["POSTGRES_DB"] = envMap["POSTGRES_DB"] || defaultDb;
    
    // Reconstruire le contenu du fichier .env.prod
    let newEnvContent = "";
    for (const key in envMap) {
      newEnvContent += `${key}=${envMap[key]}\n`;
    }
    await fs.writeFile(envProdPath, newEnvContent, "utf8");
    console.log(chalk.green("Fichier .env.prod mis à jour avec succès."));
  } catch (error) {
    console.error(chalk.red("Erreur lors de la mise à jour du fichier .env.prod:"), error);
    throw error;
  }
}
