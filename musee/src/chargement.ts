/**
 * Avancement du chargement du site, pour l'écran d'accueil (ui/Intro.tsx) : chaque partie
 * déclare ses tâches (`prevoir`, avec un poids) et leur avancement (`avancer`, de 0 à 1) ;
 * `progression()` en fait la moyenne pondérée. Une tâche prévue compte dès le départ : une
 * partie chargée à la demande (la salle) ne laisse pas croire que tout est prêt.
 */

const taches = new Map<string, { poids: number; avance: number }>()

export function prevoir(nom: string, poids = 1) {
  if (!taches.has(nom)) taches.set(nom, { poids, avance: 0 })
}

export function avancer(nom: string, avance: number, poids = 1) {
  const t = taches.get(nom)
  const a = Math.min(1, Math.max(0, avance))
  if (t) t.avance = Math.max(t.avance, a)
  else taches.set(nom, { poids, avance: a })
}

/** Avancement global, de 0 à 1 (1 si rien n'est prévu) */
export function progression() {
  let total = 0
  let fait = 0
  taches.forEach((t) => {
    total += t.poids
    fait += t.poids * t.avance
  })
  return total ? fait / total : 1
}

/** Détail des tâches (mise au point) */
export const detailChargement = () => Object.fromEntries([...taches].map(([n, t]) => [n, Math.round(t.avance * 100) + ' %']))
