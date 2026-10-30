import * as THREE from 'three'
import type { SalleConfig } from './salles/types'

/**
 * Entrée dans une salle depuis la spirale : un seul mouvement de caméra, en ligne droite,
 * de la « vue d'entrée » (la vue initiale reculée de RECUL mètres dans l'axe du regard, un
 * peu plus large) jusqu'à la vue initiale. L'orientation ne change pas en chemin.
 *
 * Le début se joue dans l'image de la carte (ui/ToileTransition : capture de la vue d'entrée
 * et sa profondeur, déformées comme si la caméra avançait, d'où la parallaxe), la suite dans
 * la salle (scene/Navigation). Les deux suivent la même avancée `u` (0 → 1), calculée ici à
 * partir de l'heure : l'image et la salle restent superposées pendant le fondu.
 */

/** Format des captures (largeur / hauteur) */
export const FORMAT_CAPTURE = 16 / 9

/**
 * Réglages des allers-retours entre la spirale et une salle. Chaque salle a les siens : ceux
 * par défaut, remplacés par le champ `transition` de sa config, puis par la touche M
 * (« Transitions · <salle> », ui/Transition.tsx). Recul, champ et regard fixent la vue d'entrée :
 * après les avoir changés, refaire la capture de la salle (outils/capture.ts).
 * Mouvement d'entrée tant que l'image est seule : u = PART_IMAGE · (1 − exp(−(t/monteeImage)²)),
 * démarrage en douceur ; puis `finSalle` secondes de freinage dans la salle, après le relais.
 */
export type ReglagesTransition = {
  /** Recul de la vue d'entrée dans l'axe du regard (m) */
  recul: number
  /** Champ de vision en plus à la vue d'entrée (°) */
  champEnPlus: number
  /**
   * Agrandissement de la capture dans sa carte, sur la spirale : pendant le zoom, le masque
   * s'ouvre jusqu'au plein écran pendant que l'image revient à 1 (on découvre la salle autour)
   */
  zoomCarte: number
  /** Point regardé, entre le regard bas et le regard haut du parcours (0,55 : la souris aux 55 % de la hauteur) */
  regard: number
  /** Durées (s) */
  zoomEntree: number
  fonduEntree: number
  zoomSortie: number
  fonduSortie: number
  monteeImage: number
  finSalle: number
}

export const TRANSITION_DEFAUT: ReglagesTransition = {
  recul: 1.6, // 1,65 m au plus dans la salle du « Seuil » : le mur sud est 2 m derrière
  champEnPlus: 10,
  zoomCarte: 2,
  regard: 0.55,
  zoomEntree: 1.4,
  fonduEntree: 0.6, // 1 s jusqu’au 30/10 : l’image de la transition s’attardait sur la salle
  zoomSortie: 1.4,
  fonduSortie: 0.5,
  monteeImage: 1.6,
  finSalle: 2.2,
}

const parSalle = new Map<string, ReglagesTransition>()
/** Les réglages de transition d'une salle (un seul objet par salle : la touche M le modifie) */
export function reglagesTransition(salle: SalleConfig): ReglagesTransition {
  let r = parSalle.get(salle.id)
  if (!r) parSalle.set(salle.id, (r = { ...TRANSITION_DEFAUT, ...salle.transition }))
  return r
}
const PART_IMAGE = 0.6

export const entree = {
  /** Instant du clic (horloge `temps`), ou null hors entrée */
  debut: null as number | null,
  /** Instant où la salle a pris le relais de l'image, ou null avant */
  relais: null as number | null,
  /** Mise au point (console) : avancée figée */
  fige: null as number | null,
  /** La salle se prépare : le mouvement n'a pas commencé */
  enAttente: false,
  /** Réglages de la salle où l'on entre */
  reglages: TRANSITION_DEFAUT,
}

/**
 * Horloge du mouvement (ms) : elle n'avance pas de plus de 50 ms d'une lecture à l'autre.
 * Quand le navigateur se fige (montage de la salle, envoi d'images à la carte graphique),
 * le mouvement reprend où il en était au lieu de sauter en avant.
 */
const horloge = { reel: 0, virtuel: 0 }
export function temps(maintenant = performance.now()) {
  if (maintenant > horloge.reel) {
    if (horloge.reel) horloge.virtuel += Math.min(maintenant - horloge.reel, 50)
    horloge.reel = maintenant
  }
  return horloge.virtuel
}

const avanceeImage = (t: number, m: number) => PART_IMAGE * (1 - Math.exp(-((t / m) ** 2)))
const vitesseImage = (t: number, m: number) => ((PART_IMAGE * 2 * t) / m ** 2) * Math.exp(-((t / m) ** 2))

/** Avancée de l'entrée (0 → 1) ; 1 hors entrée. */
export function avancee() {
  if (entree.fige !== null) return entree.fige
  if (entree.debut === null) return 1
  if (entree.enAttente) return 0
  const { monteeImage, finSalle } = entree.reglages
  const t = (temps() - entree.debut) / 1000
  if (entree.relais === null) return avanceeImage(t, monteeImage)
  // Après le relais : on repart de l'avancée et de la vitesse de l'image, et l'on freine jusqu'à 1
  const tr = (entree.relais - entree.debut) / 1000
  const p0 = avanceeImage(tr, monteeImage)
  const m0 = Math.min(vitesseImage(tr, monteeImage) * finSalle, 2.5 * (1 - p0))
  const s = Math.min(1, Math.max(0, (t - tr) / finSalle))
  // Courbe d'Hermite : (p0, vitesse m0) → (1, vitesse nulle)
  const s2 = s * s
  const s3 = s2 * s
  return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * m0 + (-2 * s3 + 3 * s2)
}

/** La vue initiale d'une salle, telle que la navigation la règle */
export type VueInitiale = {
  centre: [number, number]
  angle: number
  rayon: number
  hauteurYeux: number
  /** Hauteur du point regardé, sur l'axe de l'œuvre */
  regard: number
  /** Recul de la vue d'entrée (m) */
  recul: number
}

/** Position et point regardé à l'avancée `u` : la vue initiale, reculée de recul · (1 − u) dans l'axe du regard. */
export function poseEntree(v: VueInitiale, u: number, pos: THREE.Vector3, cible: THREE.Vector3) {
  const [cx, cz] = v.centre
  pos.set(cx + v.rayon * Math.sin(v.angle), v.hauteurYeux, cz + v.rayon * Math.cos(v.angle))
  cible.set(cx, v.regard, cz)
  const recul = v.recul * (1 - u)
  const d = cible.clone().sub(pos).normalize()
  pos.addScaledVector(d, -recul)
}

/** Part verticale de la capture visible en plein écran (l'image le couvre, comme object-fit: cover) */
export const partVisible = (formatEcran: number) => Math.min(1, FORMAT_CAPTURE / formatEcran)

/**
 * Champ de vision vertical de la salle (°) à l'avancée `u`, pour un écran de format donné :
 * à u = 0, celui de la capture plein écran ; à u = 1, la focale de la salle.
 */
export function champEntree(u: number, focale: number, formatEcran: number, champEnPlus: number) {
  const rad = THREE.MathUtils.degToRad
  const depart = 2 * Math.atan(Math.tan(rad(focale + champEnPlus) / 2) * partVisible(formatEcran))
  return THREE.MathUtils.radToDeg(THREE.MathUtils.lerp(depart, rad(focale), u))
}
