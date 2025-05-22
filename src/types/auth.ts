/**
 * @module types/auth
 * Définit les types liés au Service Account et au token dans le CLI.
 */

/**
 * Credentials bruts d’un Service Account.
 */
export interface ServiceAccount {
  /** Identifiant public du Service Account. */
  clientId: string;
  /** Secret brut du Service Account. */
  clientSecret: string;
}

/**
 * Structure interne persistée sur disque.
 */
export interface StoredServiceAccount extends ServiceAccount {
  /** Token JWT en cache. */
  accessToken?: string;
  /** Timestamp (ms) d’expiration du token. */
  expiresAt?: number;
}
