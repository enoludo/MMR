import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { GLSL_LAMES, uniformsLames } from './lames'

const MAX = 16000 // grains réservés (8000 avant le 29/10) ; le réglage « densité » n’en affiche qu’une partie

/**
 * Poussière qui flotte dans le faisceau du puits de lumière.
 *
 * Un seul objet (THREE.Points) : la position, le mouvement et l'éclat de chaque
 * grain sont calculés par la carte graphique (aucun calcul par grain côté
 * processeur). Les grains sont répartis dans le volume du faisceau et ne
 * s'allument que dans la lumière, comme de vraie poussière au soleil.
 * Les grains proches de la caméra sont plus gros et plus diffus (flou de profondeur).
 */
export function Poussiere({ config }: { config: SalleConfig }) {
  const p = useControls('Poussière', {
    densite: { value: 1, min: 0, max: 1, step: 0.01, label: 'densité' },
    taille: { value: 3.35, min: 0.3, max: 16, step: 0.05 },
    vitesse: { value: 1.05, min: 0, max: 12, step: 0.05 },
    brillance: { value: 0.45, min: 0, max: 4, step: 0.05 },
  })
  const { size, viewport, camera } = useThree()

  const { geometrie, uniforms } = useMemo(() => {
    const { direction, puits, ouverture, couleur } = config.soleil
    const dir = new THREE.Vector3(...direction).normalize()
    const demi = new THREE.Vector2(ouverture[0] / 2, ouverture[1] / 2)
    // Grains tirés au hasard dans le repère du faisceau (pavé droit, un peu plus large)
    const base = new Float32Array(MAX * 3)
    const graine = new Float32Array(MAX)
    for (let i = 0; i < MAX; i++) {
      base[i * 3] = (Math.random() * 2 - 1) * demi.x * 1.3
      base[i * 3 + 1] = Math.random() * puits[1]
      base[i * 3 + 2] = (Math.random() * 2 - 1) * demi.y * 1.3
      graine[i] = Math.random()
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(base, 3))
    g.setAttribute('aGraine', new THREE.BufferAttribute(graine, 1))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(puits[0], puits[1] / 2, puits[2]), 30)

    const uniforms = {
      uTemps: { value: 0 },
      uHaut: { value: new THREE.Vector3(...puits) },
      uPente: { value: new THREE.Vector2(dir.x / -dir.y, dir.z / -dir.y) },
      uDemi: { value: demi },
      uCouleur: { value: new THREE.Color(couleur) },
      uTaille: { value: 1 },
      uVitesse: { value: 1 },
      uBrillance: { value: 1 },
      uEchelle: { value: 1 }, // pixels par mètre à 1 m de distance
      ...uniformsLames(config.soleil),
    }
    return { geometrie: g, uniforms }
  }, [config.soleil])

  const materiau = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: /* glsl */ `
          attribute float aGraine;
          uniform float uTemps, uTaille, uVitesse, uEchelle;
          uniform vec2 uDemi;
          uniform vec3 uHaut;
          uniform vec2 uPente;
          varying float vEclat;
          ${GLSL_LAMES}

          void main() {
            float t = uTemps * uVitesse;
            float s = aGraine * 6.2831;
            vec3 q = position;
            // dérive lente : chute très douce + tourbillons
            q.y -= t * (0.025 + aGraine * 0.04);
            q.x += sin(t * 0.21 + s * 3.0) * 0.35 + sin(t * 0.67 + s * 7.0) * 0.08;
            q.z += cos(t * 0.17 + s * 5.0) * 0.35 + cos(t * 0.53 + s * 11.0) * 0.08;
            q.y += sin(t * 0.31 + s * 13.0) * 0.12;
            // on reste dans le volume (bouclage)
            vec2 largeur = uDemi * 2.6;
            q.x = mod(q.x + uDemi.x * 1.3, largeur.x) - uDemi.x * 1.3;
            q.z = mod(q.z + uDemi.y * 1.3, largeur.y) - uDemi.y * 1.3;
            q.y = mod(q.y, uHaut.y);

            // éclairé seulement dans le faisceau (bords doux), et pas collé au sol ni au plafond
            float bord = max(abs(q.x) / uDemi.x, abs(q.z) / uDemi.y);
            float h = q.y / uHaut.y;
            float lumiere = (1.0 - smoothstep(0.65, 1.15, bord)) * lames(q) * smoothstep(0.0, 0.04, h) * (1.0 - smoothstep(0.9, 1.0, h));
            // scintillement : le grain tourne et accroche la lumière par instants
            float scint = 0.35 + 0.65 * pow(0.5 + 0.5 * sin(t * (1.5 + aGraine * 3.0) + s * 17.0), 3.0);

            // repère du faisceau -> salle (le faisceau est un prisme oblique) -> vue
            float descente = uHaut.y - q.y;
            vec3 salle = vec3(q.x + uHaut.x + uPente.x * descente, q.y, q.z + uHaut.z + uPente.y * descente);
            vec4 mv = modelViewMatrix * vec4(salle, 1.0);
            gl_Position = projectionMatrix * mv;

            float diametre = 0.006 + aGraine * 0.012; // 6 à 18 mm (taille apparente du halo)
            float px = uTaille * diametre * uEchelle / max(-mv.z, 0.05);
            gl_PointSize = clamp(px, 1.0, 48.0);
            // grain trop petit : on réduit son éclat plutôt que sa taille (pas de scintillement parasite)
            // grain très proche : grand et flou, donc plus diffus
            float energie = clamp(px * px, 0.0, 1.0) / max(gl_PointSize * gl_PointSize / 9.0, 1.0);
            vEclat = lumiere * scint * energie;
            if (vEclat < 0.002) gl_PointSize = 0.0;
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCouleur;
          uniform float uBrillance;
          varying float vEclat;
          void main() {
            float d = length(gl_PointCoord - 0.5) * 2.0;
            float a = pow(max(1.0 - d, 0.0), 1.8);
            gl_FragColor = vec4(uCouleur * vEclat * a * uBrillance * 1.6, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [uniforms],
  )

  // Moins de grains sur les petits écrans (téléphones)
  const facteurEcran = size.width < 768 ? 0.5 : 1
  useEffect(() => {
    geometrie.setDrawRange(0, Math.round(MAX * p.densite * facteurEcran))
    uniforms.uTaille.value = p.taille
    uniforms.uVitesse.value = p.vitesse
    uniforms.uBrillance.value = p.brillance
  }, [geometrie, uniforms, p, facteurEcran])

  useFrame((_, dt) => {
    uniforms.uTemps.value += Math.min(dt, 0.1)
    const cam = camera as THREE.PerspectiveCamera
    uniforms.uEchelle.value = (size.height * viewport.dpr * 0.5) / Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
  })

  return <points geometry={geometrie} material={materiau} renderOrder={6} raycast={() => null} />
}
