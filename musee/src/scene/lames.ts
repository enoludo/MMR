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
