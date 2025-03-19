import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

interface ComposeService {
  name: string;
  depends_on: string[];
  orderAppearance: number;
}

/**
 * Déduit l'ordre de déploiement des services à partir du fichier docker-compose.yml.
 * Le tri se fait par dépendances et, en cas d'égalité, par l'ordre d'apparition.
 * Pour chaque service s, pour chaque dépendance d dans s.depends_on, on incrémente inDegree[s].
 * @param composePath Chemin du fichier docker-compose.yml.
 * @returns Un tableau de noms de services trié dans l'ordre de déploiement.
 * @throws Une erreur en cas de cycle ou d'ordre incomplet.
 */
export async function deduceDeploymentOrder(composePath: string): Promise<string[]> {
  if (!(await fs.pathExists(composePath))) {
    throw new Error(`Fichier ${composePath} introuvable.`);
  }
  const content = await fs.readFile(composePath, 'utf8');
  const composeData: any = yaml.load(content);
  const serviceNames: string[] = Object.keys(composeData.services || {});
  
  // Construire un tableau avec dépendances et ordre d'apparition.
  const services: ComposeService[] = serviceNames.map((name, index) => ({
    name,
    depends_on: composeData.services[name].depends_on || [],
    orderAppearance: index
  }));

  // Calculer les degrés d'entrée pour chaque service.
  // Pour chaque service s, pour chaque dépendance d dans s.depends_on, on incrémente le degré d'entrée de s.
  const inDegree = new Map<string, number>();
  services.forEach(s => inDegree.set(s.name, 0));
  services.forEach(s => {
    s.depends_on.forEach(dep => {
      // Incrémente inDegree de s (et non de dep) puisque s dépend de d.
      inDegree.set(s.name, inDegree.get(s.name)! + 1);
    });
  });

  // Initialiser la file avec les services sans dépendances (inDegree = 0), triés par ordre d'apparition.
  const queue: ComposeService[] = services
    .filter(s => inDegree.get(s.name) === 0)
    .sort((a, b) => a.orderAppearance - b.orderAppearance);

  const order: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    order.push(current.name);
    // Pour chaque service qui dépend de "current", décrémenter son inDegree.
    services.forEach(s => {
      if (s.depends_on.includes(current.name)) {
        inDegree.set(s.name, inDegree.get(s.name)! - 1);
        if (inDegree.get(s.name) === 0) {
          queue.push(s);
        }
      }
    });
    queue.sort((a, b) => a.orderAppearance - b.orderAppearance);
  }

  if (order.length !== services.length) {
    throw new Error("Cycle détecté ou ordre de déploiement incomplet.");
  }
  return order;
}
