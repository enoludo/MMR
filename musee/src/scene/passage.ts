import * as THREE from 'three'
import type { Porte, SalleConfig, Vec3 } from '../salles/types'
import type { Sens } from '../store'

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
