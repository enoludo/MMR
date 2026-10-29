import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'

/**
 * Lames du puits : elles découpent le faisceau de soleil en bandes (faisceau visible dans
 * l'air, poussière). Calcul dans le repère du faisceau (voir Faisceau.tsx) : le prisme oblique
 * y devient un pavé droit, et les vides entre les lames des bandes le long de x. Le bord de
 * chaque bande s'adoucit en s'éloignant des lames, comme la pénombre d'un soleil voilé.
 */
export const MAX_VIDES = 8

export function uniformsLames(soleil: SalleConfig['soleil']) {
  const dir = new THREE.Vector3(...soleil.direction).normalize()
  const penteX = dir.x / -dir.y
  const l = soleil.lames
  const hautLames = l ? (l.bas + l.haut) / 2 : soleil.puits[1]
  // Abscisse dans le repère du faisceau : on retranche le décalage dû à la hauteur des lames
  const decalage = soleil.puits[0] + penteX * (soleil.puits[1] - hautLames)
  const vides = Array.from({ length: MAX_VIDES }, (_, i) => {
    const v = l?.vides[i]
    return v ? new THREE.Vector2(v[0] - decalage, v[1] - decalage) : new THREE.Vector2()
  })
  return {
    uVides: { value: vides },
    uNbVides: { value: l ? Math.min(l.vides.length, MAX_VIDES) : 0 },
    uHautLames: { value: hautLames },
    // demi-largeur de la pénombre par mètre de descente sous les lames
    uFlouLames: { value: Math.tan(THREE.MathUtils.degToRad(l?.douceur ?? soleil.angle)) / 2 },
  }
}

/** `float lames(vec3 q)` : part de lumière qui passe entre les lames (0 à 1), q dans le repère du faisceau. */
export const GLSL_LAMES = /* glsl */ `
  uniform vec2 uVides[${MAX_VIDES}];
  uniform int uNbVides;
  uniform float uHautLames;
  uniform float uFlouLames;
  float lames(vec3 q) {
    if (uNbVides == 0) return 1.0;
    float flou = 0.04 + uFlouLames * max(uHautLames - q.y, 0.0);
    float l = 0.0;
    for (int i = 0; i < ${MAX_VIDES}; i++) {
      if (i >= uNbVides) break;
      vec2 v = uVides[i];
      l += smoothstep(v.x - flou, v.x + flou, q.x) * (1.0 - smoothstep(v.y - flou, v.y + flou, q.x));
    }
    return clamp(l, 0.0, 1.0);
  }
`

/** Taille de la table des lames (largeur du faisceau × hauteur) */
const TABLE_LARGEUR = 2048
const TABLE_HAUTEUR = 64

const lisse = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * `lames(q)` précalculée une fois pour toutes, sur la largeur du faisceau (x de −demiX à demiX)
 * et sa hauteur (y de 0 à haut) : le faisceau la lit au lieu de la recalculer à chaque pas de
 * sa marche (12 pas × 6 lames par pixel, le plus gros de son coût). Même calcul que GLSL_LAMES ;
 * la lumière ne varie que lentement en hauteur, 64 rangées suffisent (lecture interpolée).
 */
const tables = new Map<string, THREE.DataTexture>()

export function tableLames(soleil: SalleConfig['soleil'], demiX: number, haut: number) {
  const u = uniformsLames(soleil)
  const vides = u.uVides.value.slice(0, u.uNbVides.value)
  // Une table par jeu de lames (≈ 35 ms à calculer) : les salles qui ont les mêmes la partagent
  const cle = JSON.stringify([vides, u.uHautLames.value, u.uFlouLames.value, demiX, haut])
  const dejaLa = tables.get(cle)
  if (dejaLa) return { uTableLames: { value: dejaLa }, uTableEchelle: { value: new THREE.Vector2(demiX, haut) } }
  const donnees = new Uint16Array(TABLE_LARGEUR * TABLE_HAUTEUR)
  for (let j = 0; j < TABLE_HAUTEUR; j++) {
    const y = ((j + 0.5) / TABLE_HAUTEUR) * haut
    const flou = 0.04 + u.uFlouLames.value * Math.max(u.uHautLames.value - y, 0)
    for (let i = 0; i < TABLE_LARGEUR; i++) {
      const x = ((i + 0.5) / TABLE_LARGEUR - 0.5) * 2 * demiX
      let l = vides.length ? 0 : 1
      for (const v of vides) l += lisse(v.x - flou, v.x + flou, x) * (1 - lisse(v.y - flou, v.y + flou, x))
      donnees[j * TABLE_LARGEUR + i] = THREE.DataUtils.toHalfFloat(Math.min(1, Math.max(0, l)))
    }
  }
  const texture = new THREE.DataTexture(donnees, TABLE_LARGEUR, TABLE_HAUTEUR, THREE.RedFormat, THREE.HalfFloatType)
  texture.minFilter = texture.magFilter = THREE.LinearFilter
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping
  texture.needsUpdate = true
  tables.set(cle, texture)
  return { uTableLames: { value: texture }, uTableEchelle: { value: new THREE.Vector2(demiX, haut) } }
}

/** `float lamesTable(vec3 q)` : lecture de tableLames, q dans le repère du faisceau */
export const GLSL_TABLE_LAMES = /* glsl */ `
  uniform sampler2D uTableLames;
  uniform vec2 uTableEchelle;
  float lamesTable(vec3 q) {
    return texture2D(uTableLames, vec2(q.x / (2.0 * uTableEchelle.x) + 0.5, q.y / uTableEchelle.y)).r;
  }
`
