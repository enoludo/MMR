import * as THREE from 'three'
import type { Porte, SalleConfig, Vec3 } from '../salles/types'
import { store, type SalleVisitee, type Sens } from '../store'
import { oeuvres } from '../oeuvres'

/**
 * Passage d'une salle à l'autre, par une porte et un couloir.
 *
 * La salle où l'on se trouve est toujours à l'origine. Pendant un passage, la salle
 * d'arrivée est posée au bout du couloir, retournée : sa porte fait face à la nôtre.
 * À l'arrivée, on « recale » tout sur elle dans la même image (elle revient à
 * l'origine, la caméra avec elle) : rien ne bouge à l'écran.
 */

/** Longueur du couloir entre les deux portes (m) */
export const LONGUEUR_COULOIR = 14

/** Groupes 3D des salles chargées, par clé de visite (voir store.SalleVisitee) */
export const groupesSalles = new Map<number, THREE.Group>()

/**
 * Salles prêtes à être vues, par clé de visite : la salle d'arrivée d'un passage reste cachée le temps
 * de sa préparation (PreparationPassage, Experience.tsx) ; le bout du couloir garde sa lueur jusque-là.
 */
export const sallesPretes = new Set<number>()

/** Angle horizontal d'une direction (même convention que la navigation : 0 = +z) */
const cap = (d: THREE.Vector3 | Vec3) => (Array.isArray(d) ? Math.atan2(d[0], d[2]) : Math.atan2(d.x, d.z))

/** Placement (position, rotation autour de y, et symétrie gauche-droite éventuelle) d'une salle ou d'un couloir */
export type Placement = { position: THREE.Vector3; rotationY: number; miroir?: boolean }

export const ORIGINE: Placement = { position: new THREE.Vector3(), rotationY: 0 }

/**
 * Placement de la salle d'arrivée : sa porte `arrivee` au bout du couloir qui part de
 * la porte `depart` de la salle actuelle (à l'origine), tournée vers nous.
 */
export function placementArrivee(depart: Porte, arrivee: Porte, longueur = LONGUEUR_COULOIR): Placement {
  const dDepart = new THREE.Vector3(...depart.direction).normalize()
  const bout = new THREE.Vector3(...depart.position).addScaledVector(dDepart, longueur)
  // La porte d'arrivée doit regarder vers nous : sa direction devient -dDepart
  const rotationY = cap(dDepart.clone().negate()) - cap(arrivee.direction)
  const position = bout.sub(new THREE.Vector3(...arrivee.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rotationY))
  return { position, rotationY }
}

/**
 * Portes empruntées par un passage : vers l'œuvre suivante, on sort par la sortie et l'on
 * entre par l'entrée de la salle suivante ; vers la précédente, on remonte le parcours.
 */
export function portesDuPassage(depart: SalleConfig, arrivee: SalleConfig, sens: Sens) {
  const [quitte, rejoint] = sens === 'suivante' ? (['sortie', 'entree'] as const) : (['entree', 'sortie'] as const)
  const trouver = (s: SalleConfig, id: Porte['id']) => s.portes.find((p) => p.id === id) ?? s.portes[0]
  return { porte: trouver(depart, quitte), porteArrivee: trouver(arrivee, rejoint) }
}

export const matricePlacement = (p: Placement, out = new THREE.Matrix4()) => {
  out.makeRotationY(p.rotationY).setPosition(p.position)
  return p.miroir ? out.scale(new THREE.Vector3(-1, 1, 1)) : out
}

/**
 * Placement du couloir : son origine au seuil de la porte, son axe -z vers l'extérieur. Le
 * couloir est construit avec ses fentes à gauche (en partant de la salle) ; s'il les faut à
 * droite, il est retourné (symétrie gauche-droite).
 */
export function placementCouloir(porte: Porte): Placement {
  return {
    position: new THREE.Vector3(...porte.position),
    rotationY: cap(porte.direction) - Math.PI,
    miroir: porte.couloir?.fentes === 'droite',
  }
}

/* Salles de la visite lues dans l'état, à chaque image (Salle.Eclairage, Effets) */
export const salleActuelle = () => {
  const v = store.get().salle
  return v ? groupesSalles.get(v.cle) : undefined
}
export const salleArrivee = () => {
  const v = store.get().passage
  return v ? groupesSalles.get(v.cle) : undefined
}
const configDe = (v: SalleVisitee | null) => (v ? (oeuvres.find((o) => o.id === v.oeuvre) ?? oeuvres[0]).salle : undefined)
/** Config de la salle où l'on est et de la salle d'arrivée, lues dans l'état (à jour dans l'image même de l'arrivée) */
export const configActuelle = () => configDe(store.get().salle)
export const configArriveeLue = () => configDe(store.get().passage)
/**
 * Pendant un passage, part de la salle d'arrivée dans ce qui glisse d'une salle à l'autre (ambiance de
 * l'œuvre, effets d'image) : 0 dans la salle quittée, 1 dans la salle d'arrivée, selon la distance de
 * la caméra à chacune ; 0 hors passage.
 */
export function poidsArrivee(camera: THREE.Camera) {
  const ga = salleActuelle()
  const gb = salleArrivee()
  if (!ga || !gb || !configArriveeLue()) return 0
  const da = camera.position.distanceTo(ga.position)
  const db = camera.position.distanceTo(gb.position)
  return THREE.MathUtils.smoothstep((da - db) / 30 + 0.5, 0, 1)
}
