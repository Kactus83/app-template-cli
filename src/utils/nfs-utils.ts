import { spawnSync } from "child_process";
import chalk from "chalk";

/**
 * Vérifie si ce process NodeJS est vraiment exécuté en mode Administrateur sous Windows.
 * (La commande `net session` ne réussit qu’en Admin.)
 */
function isWindowsAdmin(): boolean {
  const res = spawnSync("net", ["session"], { stdio: "ignore", shell: true });
  // status 0 => Admin, status ≠ 0 => pas Admin ou commande indisponible
  return res.status === 0;
}

/**
 * Tente d'installer ou d'activer le support NFS selon la plateforme.
 * Retourne true si l'opération semble avoir réussi.
 */
export function autoFixNfsSupport(): boolean {
  console.log(chalk.blue("→ Tentative de correction automatique NFS…"));

  if (process.platform === "win32") {
    if (!isWindowsAdmin()) {
      console.error(chalk.red("❌ Merci de relancer ce CLI en tant qu’administrateur (Run as Admin)."));
      return false;
    }
    console.log(chalk.yellow("  • Activation du composant NFS client Windows…"));
    const res = spawnSync("powershell.exe", [
      "-NoProfile",
      "-Command",
      "Enable-WindowsOptionalFeature -Online -FeatureName ClientForNFS-Optional -All -NoRestart"
    ], { stdio: "inherit" });
    if (res.status === 0) {
      console.log(chalk.green("✓ Correction automatique terminée avec succès."));
      return true;
    } else {
      console.log(chalk.red("✖ La correction automatique a échoué."));
      return false;
    }
  }

  // Linux / macOS
  let res;
  if (process.platform === "linux") {
    console.log(chalk.yellow("  • Mise à jour des paquets…"));
    spawnSync("sudo", ["apt-get", "update"], { stdio: "inherit" });
    console.log(chalk.yellow("  • Installation de nfs-common…"));
    res = spawnSync("sudo", ["apt-get", "install", "-y", "nfs-common"], { stdio: "inherit" });
  } else if (process.platform === "darwin") {
    console.log(chalk.yellow("  • Installation via Homebrew de nfs-client…"));
    res = spawnSync("brew", ["install", "nfs-client"], { stdio: "inherit", shell: true });
  } else {
    console.log(chalk.red("  • Plateforme non supportée pour auto-correction."));
    return false;
  }

  if (res.status === 0) {
    console.log(chalk.green("✓ Correction automatique terminée avec succès."));
    return true;
  } else {
    console.log(chalk.red("✖ La correction automatique a échoué."));
    return false;
  }
}
