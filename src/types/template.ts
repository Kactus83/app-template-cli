/**
 * @module types/template
 * Définition du type renvoyé par le backend pour un template.
 */

/**
 * Représentation d’un template exposé par l’API.
 */
export interface Template {
  /** Identifiant unique du template */
  id: string;
  /** Nom affichable */
  name: string;
  /** Description (optionnelle) */
  description?: string;
}
