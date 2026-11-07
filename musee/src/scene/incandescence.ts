import * as THREE from 'three'

/**
 * « Souffle d'éclats » : bronches incandescentes, comme une résistance électrique (07/11, demande de Ludovic, d'après
 * le manifeste : « les variations d'intensité des lumières illustrent les nuances de la douleur »). Remplace les
 * faisceaux dans l'air essayés juste avant (« on dirait des spots ») : la lumière reste dans la coque de verre.
 * - `douleur(t)` : fond irrégulier (sinusoïdes sans rapport entier : il ne se répète pas de façon visible), crises
 *   rares et plus aiguës, scintillement rapide et léger, comme un filament ;
 * - `chaleur(y)` : chauffe des bronches à la hauteur y (repère du monde), la douleur descendant de la trachée à
 *   `uOnde` m/s (0 : tout ensemble) ;
 * - `rampe(h)` : couleur d'incandescence, de la couleur basse à la couleur haute, blanchie au plus chaud.
 * Partagé par les bronches (leur lumière) et le verre (la lumière qu'elles y jettent), OeuvreVerre.tsx.
 * Réglages : touche M, « Verre · <salle> ».
 */
export const GLSL_INCANDESCENCE = /* glsl */ `
  uniform float uTemps, uChauffe, uVariation, uVitesse, uCrises, uScintillement, uOnde;
  uniform vec3 uFroid, uChaud;
  float douleur(float t) {
    float s = t * uVitesse;
    float fond = 0.5 + 0.26 * sin(s * 1.13) + 0.15 * sin(s * 2.71 + 1.3) + 0.09 * sin(s * 6.37 + 0.7);
    float crise = pow(clamp(sin(s * 0.37 + 2.0) * sin(s * 0.23 + 0.5), 0.0, 1.0), 4.0);
    float scint = 0.5 * sin(t * 23.0) + 0.35 * sin(t * 37.7 + 1.1) + 0.15 * sin(t * 61.3 + 2.3);
    return max(fond + uCrises * 1.2 * crise + uScintillement * 0.25 * scint, 0.0);
  }
  float chaleur(float y) {
    float retard = uOnde > 0.01 ? max(4.7 - y, 0.0) / uOnde : 0.0;
    return uChauffe * mix(1.0, douleur(uTemps - retard), uVariation);
  }
  vec3 rampe(float h) {
    vec3 c = mix(uFroid, uChaud, smoothstep(0.4, 1.6, h));
    return mix(c, vec3(1.0, 0.86, 0.62), smoothstep(1.6, 2.6, h));
  }`

export type UniformsIncandescence = ReturnType<typeof creerUniformsIncandescence>
export const creerUniformsIncandescence = () => ({
  uTemps: { value: 0 },
  uChauffe: { value: 1 },
  uVariation: { value: 0.6 },
  uVitesse: { value: 0.6 },
  uCrises: { value: 0.6 },
  uScintillement: { value: 0.15 },
  uOnde: { value: 2 },
  uFroid: { value: new THREE.Color() },
  uChaud: { value: new THREE.Color() },
})

/** Nombre de points tirés sur les bronches : d'où vient la lumière jetée dans le verre */
export const POINTS_BRONCHES = 32

/**
 * Points répartis sur les bronches (repère du modèle) : tirage du plus éloigné parmi 3000 sommets, pour couvrir
 * la trachée et toutes les branches
 */
export function pointsBronches(mesh: THREE.Mesh): THREE.Vector3[] {
  const pos = mesh.geometry.getAttribute('position')
  mesh.updateMatrix()
  const pas = Math.max(1, Math.floor(pos.count / 3000))
  const candidats: THREE.Vector3[] = []
  for (let i = 0; i < pos.count; i += pas) candidats.push(new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix))
  const points = [candidats[0]]
  const dist = candidats.map((c) => c.distanceToSquared(points[0]))
  while (points.length < POINTS_BRONCHES && points.length < candidats.length) {
    let loin = 0
    for (let i = 1; i < candidats.length; i++) if (dist[i] > dist[loin]) loin = i
    points.push(candidats[loin])
    for (let i = 0; i < candidats.length; i++) dist[i] = Math.min(dist[i], candidats[i].distanceToSquared(candidats[loin]))
  }
  while (points.length < POINTS_BRONCHES) points.push(points[0].clone())
  return points
}

/**
 * Chaleur des bronches, calculée aussi sur le processeur (même formule que `douleur` et `chaleur`, sans l'onde) :
 * elle règle la lueur de l'œuvre sur la salle (pierre.ts, Salle.tsx). Tenue à jour à chaque image par OeuvreVerre.
 */
export const etatIncandescence = { chaleur: 0 }
export function chaleurProcesseur(t: number, r: { chauffe: number; variation: number; vitesse: number; crises: number; scintillement: number }) {
  const s = t * r.vitesse
  const fond = 0.5 + 0.26 * Math.sin(s * 1.13) + 0.15 * Math.sin(s * 2.71 + 1.3) + 0.09 * Math.sin(s * 6.37 + 0.7)
  const crise = Math.pow(Math.min(Math.max(Math.sin(s * 0.37 + 2.0) * Math.sin(s * 0.23 + 0.5), 0), 1), 4)
  const scint = 0.5 * Math.sin(t * 23.0) + 0.35 * Math.sin(t * 37.7 + 1.1) + 0.15 * Math.sin(t * 61.3 + 2.3)
  const douleur = Math.max(fond + r.crises * 1.2 * crise + r.scintillement * 0.25 * scint, 0)
  return r.chauffe * (1 + (douleur - 1) * r.variation)
}
