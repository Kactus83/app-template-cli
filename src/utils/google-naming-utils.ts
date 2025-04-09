/**
 *
 * Ce module fournit des fonctions avancées de validation, correction et suggestion
 * pour les noms de régions et de zones utilisés dans Google Cloud.
 */

export const GOOGLE_CLOUD_REGIONS = [
    "us-central1", "us-east1", "us-east4", "us-west1",
    "europe-west1", "europe-west2", "europe-west3", "europe-west4",
    "asia-east1", "asia-southeast1"
  ];
  
  export const GOOGLE_CLOUD_ZONES: { [region: string]: string[] } = {
    "us-central1": ["us-central1-a", "us-central1-b", "us-central1-c", "us-central1-f"],
    "us-east1": ["us-east1-b", "us-east1-c", "us-east1-d"],
    "us-east4": ["us-east4-a", "us-east4-b", "us-east4-c"],
    "us-west1": ["us-west1-a", "us-west1-b", "us-west1-c"],
    "europe-west1": ["europe-west1-b", "europe-west1-c", "europe-west1-d"],
    "europe-west2": ["europe-west2-a", "europe-west2-b", "europe-west2-c"],
    "europe-west3": ["europe-west3-a", "europe-west3-b", "europe-west3-c"],
    "europe-west4": ["europe-west4-a", "europe-west4-b", "europe-west4-c"],
    "asia-east1": ["asia-east1-a", "asia-east1-b", "asia-east1-c"],
    "asia-southeast1": ["asia-southeast1-a", "asia-southeast1-b", "asia-southeast1-c"]
  };
  
  /**
   * Vérifie si la région est valide, c'est-à-dire si elle figure dans la liste prédéfinie.
   * @param region La région à valider (ex. "europe-west1").
   * @returns true si la région est valide, false sinon.
   */
  export function isValidRegion(region: string): boolean {
    const r = region.trim().toLowerCase();
    return GOOGLE_CLOUD_REGIONS.includes(r);
  }
  
  /**
   * Vérifie si la zone est valide en s'assurant qu'elle figure dans la liste des zones pour une région donnée.
   * @param zone La zone à valider (ex. "europe-west1-b").
   * @returns true si la zone est valide, false sinon.
   */
  export function isValidZone(zone: string): boolean {
    const z = zone.trim().toLowerCase();
    for (const region in GOOGLE_CLOUD_ZONES) {
      if (GOOGLE_CLOUD_ZONES[region].includes(z)) {
        return true;
      }
    }
    return false;
  }
  
  /**
   * Extrait la région à partir d'une zone.
   * Par exemple, "europe-west1-b" donnera "europe-west1".
   * @param zone La zone fournie.
   * @returns La région correspondante, ou une chaîne vide si non déterminable.
   */
  export function deduceRegionFromZone(zone: string): string {
    const z = zone.trim().toLowerCase();
    const deduced = z.substring(0, z.lastIndexOf("-"));
    return isValidRegion(deduced) ? deduced : "";
  }
  
  /**
   * Corrige une entrée pour la région.
   * Si l'utilisateur saisit une zone par inadvertance, propose la région correspondante et l'indique à l'utilisateur.
   * @param input La valeur saisie par l'utilisateur.
   * @returns La région corrigée.
   */
  export function correctRegionInput(input: string): string {
    const trimmed = input.trim().toLowerCase();
    if (isValidZone(trimmed)) {
      const deduced = deduceRegionFromZone(trimmed);
      console.info(`Une zone a été saisie ("${trimmed}"). La région correspondante est "${deduced}".`);
      return deduced;
    }
    return trimmed;
  }
  
  /**
   * Valide l'entrée pour la zone.
   * @param input La valeur saisie par l'utilisateur.
   * @returns La zone si elle est valide, sinon une chaîne vide.
   */
  export function validateZoneInput(input: string): string {
    const trimmed = input.trim().toLowerCase();
    return isValidZone(trimmed) ? trimmed : "";
  }
  
  /**
   * Propose une liste de zones possibles pour une région donnée.
   * @param region La région pour laquelle proposer les zones.
   * @returns Un tableau de zones possibles.
   */
  export function suggestZonesForRegion(region: string): string[] {
    const r = region.trim().toLowerCase();
    return GOOGLE_CLOUD_ZONES[r] || [];
  }
  