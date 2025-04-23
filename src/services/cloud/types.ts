/** Résultat de terraform apply pour storage */
export interface StorageInfraData {
  provider: "google" | "aws";
  filestoreIp?: string;        // GCP
  efsMountTargetIp?: string;   // AWS
}

/** Gestion du module storage (Filestore / EFS) */
export interface IStorageService {
  // 1️⃣ Génère le terraform.tfvars.json (uniquement pour storage)
  generateTerraformConfig(): Promise<void>;

  // 2️⃣ Vérifie que l’infra stockée existe et répond
  checkInfra(): Promise<boolean>;

  // 3️⃣ Provisionne + retourne IP/ID
  deployAndFetchData(): Promise<StorageInfraData>;

  // 4️⃣ Vérifie dans docker‑compose.prod.yml les driver_opts
  checkComposeDrivers(infraData: StorageInfraData): Promise<{
    volumeName: string;
    currentDriverOpts: any;
    expectedDriverOpts: any;
  }[]>;

  // 5️⃣ Injecte dans docker‑compose.prod.yml les driver_opts corrects
  fixComposeDrivers(infraData: StorageInfraData): Promise<void>;

  // 6️⃣ Vérifie que le mount target EFS est accessible
  testMount(infraData: StorageInfraData): Promise<boolean>;
}

/** Résultat de terraform apply pour DB */
export interface DBInfraData {
  provider: "google" | "aws";
  // GCP
  connectionName?: string;
  publicIp?: string;
  // AWS
  endpoint?: string;
  port?: number;
}

/** Gestion du module DB (Cloud SQL / RDS) */
export interface IDbService {
  // 1️⃣ Génère le terraform.tfvars.json (uniquement pour db)
  generateTerraformConfig(): Promise<void>;

  // 2️⃣ Vérifie que l’infra DB existe et répond
  checkInfra(): Promise<boolean>;

  // 3️⃣ Provisionne + retourne connection infos
  deployAndFetchData(): Promise<DBInfraData>;
  fetchInfraData(): Promise<DBInfraData>;

  // 4️⃣ Vérifie que l’utilisateur existe dans la DB
  checkUserExists(infraData: DBInfraData): Promise<boolean>;

  // 5️⃣ Crée l’utilisateur si besoin
  createUser(infraData: DBInfraData): Promise<void>;
}

/** Résultat de terraform apply pour la VM */
export interface ComputeInfraData {
  provider   : "google" | "aws";
  publicIp   : string;
  sshUser    : string;
  sshKeyPath : string;
}

/** Gestion du module Compute (VM Linux) */
export interface IComputeService {
  // 1️⃣ Génère le terraform.tfvars.json pour la VM (sans paramètre)
  generateTerraformConfig(): Promise<void>;

  // 2️⃣ Vérifie que la VM existe et répond
  checkInfra(): Promise<boolean>;

  // 3️⃣ Provisionne + retourne IP & infos SSH
  deployAndFetchData(): Promise<ComputeInfraData>;
}