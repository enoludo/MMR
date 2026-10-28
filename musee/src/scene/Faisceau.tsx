import { useMemo } from 'react'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'

/**
 * Faisceau de soleil visible dans l'air (lumière volumétrique simplifiée).
 *
 * Le faisceau est un prisme oblique : la section carrée du puits, translatée
 * dans la direction du soleil jusqu'au sol. Pour chaque pixel, le shader
 * calcule la longueur du rayon de vue qui traverse ce prisme : plus on
 * traverse de « lumière », plus le pixel s'éclaire. On obtient un faisceau
 * aux bords naturellement adoucis, quel que soit le point de vue, y compris
 * quand on se tient dedans. Coût : un seul prisme, un calcul analytique.
 */
export function Faisceau({ config }: { config: SalleConfig }) {
  const f = useControls('Faisceau', {
    intensite: { value: 0.009, min: 0, max: 0.06, step: 0.001, label: 'intensité' },
  })

  const { geometrie, uniforms } = useMemo(() => {
    const { direction, puits, taillePuits, couleur } = config.soleil
    const dir = new THREE.Vector3(...direction).normalize()
    const haut = new THREE.Vector3(...puits)
    // décalage horizontal du faisceau par mètre de descente
    const pente = new THREE.Vector2(dir.x / -dir.y, dir.z / -dir.y)
    const bas = new THREE.Vector3(haut.x + pente.x * haut.y, 0, haut.z + pente.y * haut.y)

    // Prisme englobant (légèrement agrandi), dessiné par ses faces arrière
    const g = new THREE.BoxGeometry(taillePuits * 1.27, 1, taillePuits * 1.27)
    const p = g.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const t = p.getY(i) + 0.5 // 0 = sol, 1 = plafond
      const c = bas.clone().lerp(haut, t)
      p.setXYZ(i, p.getX(i) + c.x, Math.max(c.y, 0.02), p.getZ(i) + c.z)
    }
    g.computeBoundingSphere()

    const uniforms = {
      uCouleur: { value: new THREE.Color(couleur) },
      uIntensite: { value: 0 },
      uHaut: { value: haut },
      uPente: { value: pente },
      uDemi: { value: taillePuits / 2 },
    }
    return { geometrie: g, uniforms }
  }, [config.soleil])

  const materiau = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms,
        // Calcul dans le repère de la salle (elle peut être posée ailleurs pendant un passage)
        vertexShader: /* glsl */ `
          varying vec3 vMonde;
          varying vec3 vCamera;
          void main() {
            vMonde = position;
            vCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCouleur;
          uniform float uIntensite;
          uniform vec3 uHaut;
          uniform vec2 uPente;
          uniform float uDemi;
          varying vec3 vMonde;
          varying vec3 vCamera;

          // Passage dans le repère du faisceau : le prisme oblique y devient un pavé droit
          vec3 versFaisceau(vec3 p) {
            float descente = uHaut.y - p.y;
            return vec3(p.x - uHaut.x - uPente.x * descente, p.y, p.z - uHaut.z - uPente.y * descente);
          }

          void main() {
            vec3 a = versFaisceau(vCamera);
            vec3 b = versFaisceau(vMonde);
            vec3 d = b - a;
            float lMonde = length(vMonde - vCamera);
            // Intersection du segment caméra → pixel avec le pavé (légèrement élargi pour le flou des bords)
            float demiExt = uDemi * 1.25;
            vec3 mini = vec3(-demiExt, 0.0, -demiExt);
            vec3 maxi = vec3(demiExt, uHaut.y, demiExt);
            vec3 inv = 1.0 / d;
            vec3 t0 = (mini - a) * inv;
            vec3 t1 = (maxi - a) * inv;
            vec3 tmin = min(t0, t1);
            vec3 tmax = max(t0, t1);
            float entree = max(max(tmin.x, tmin.y), max(tmin.z, 0.0));
            float sortie = min(min(tmax.x, tmax.y), min(tmax.z, 1.0));
            if (sortie <= entree) discard;
            // Petite marche le long du rayon : densité douce, qui s'estompe vers les bords
            const int N = 12;
            float pas = (sortie - entree) / float(N);
            float somme = 0.0;
            for (int i = 0; i < N; i++) {
              vec3 q = a + d * (entree + (float(i) + 0.5) * pas);
              float bord = max(abs(q.x), abs(q.z)) / uDemi;          // 1 = bord du puits
              float coeur = 1.0 - smoothstep(0.6, 1.22, bord);       // bords flous
              float h = q.y / uHaut.y;
              float hauteur = smoothstep(0.0, 0.15, h) * mix(1.0, 0.5, h); // plus dense vers le bas
              somme += coeur * hauteur;
            }
            float longueur = somme * pas * lMonde;
            float lum = 1.0 - exp(-longueur * uIntensite * 6.0);
            gl_FragColor = vec4(uCouleur * lum, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
      }),
    [uniforms],
  )
  uniforms.uIntensite.value = f.intensite

  return <mesh geometry={geometrie} material={materiau} renderOrder={5} frustumCulled={false} userData={{ traversable: true }} />
}
