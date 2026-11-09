import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { dessinsDirects, GLSL_SORTIE, surEchantillonnage, uSortie } from './Effets'

/**
 * Petites lumières de la salle (spots encastrés du pavillon, 09/11, demande de Ludovic : « ils clignotent ») : un
 * verre lumineux de 12 cm, vu à plat de loin, est plus petit qu'un pixel ; la carte graphique le dessine tantôt dans
 * le pixel, tantôt à côté, et il clignote quand la caméra bouge (le halo amplifie chaque apparition). Baisser son
 * éclat ne suffisait pas.
 * Chaque verre (matière à `petit` dans la config) reçoit donc un point lumineux, dessiné comme la poussière (après
 * la réduction du suréchantillonnage, dans son calque) : jamais moins de PX_MIN pixels de large, son éclat suit la
 * surface que le verre couvre vraiment à l'écran (taille, distance, angle), sans dépendre de la grille des pixels.
 * Le verre lui-même s'éteint quand il devient petit (`eclatSelonTaille`, Salle.tsx) ; les deux se relaient en fondu,
 * entre FONDU_DEBUT et FONDU_FIN pixels d'épaisseur apparente.
 */
const PX_MIN = 3
export const FONDU_DEBUT = 2
export const FONDU_FIN = 5

export function PetitesLumieres({ config, scene }: { config: SalleConfig; scene: THREE.Object3D }) {
  const size = useThree((s) => s.size)
  const viewport = useThree((s) => s.viewport)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera

  const petits = useMemo(
    () => Object.entries(config.matieres).filter(([, m]) => m.petit).map(([nom, m]) => ({ nom, ...m })),
    [config],
  )
  const uEchelle = useMemo(() => ({ value: 1 }), [])

  // Un point par verre : centres des verres, juste au-dessus de leur face
  useEffect(() => {
    const ajoutes: THREE.Points[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const nom = (mesh.material as THREE.Material).name
      const petit = petits.find((p) => p.nom === nom)
      if (!petit) return
      // Positions du modèle compressé (quantifiées : l'échelle est dans la transformation de son nœud) ramenées en
      // mètres de la salle pour le regroupement, puis les centres rendus au repère du maillage
      scene.updateMatrixWorld(true)
      const versSalle = scene.matrixWorld.clone().invert().multiply(mesh.matrixWorld)
      const versLocal = versSalle.clone().invert()
      const pos = mesh.geometry.getAttribute('position')
      // Regroupement par distance (30 cm) : un groupe par verre
      const groupes: { somme: THREE.Vector3; n: number; haut: number }[] = []
      const v = new THREE.Vector3()
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(versSalle)
        let g = groupes.find((x) => Math.hypot(x.somme.x / x.n - v.x, x.somme.z / x.n - v.z) < 0.3)
        if (!g) groupes.push((g = { somme: new THREE.Vector3(), n: 0, haut: -Infinity }))
        g.somme.add(v)
        g.n++
        g.haut = Math.max(g.haut, v.y)
      }
      const centres: number[] = []
      for (const g of groupes) {
        v.set(g.somme.x / g.n, g.haut + 0.004, g.somme.z / g.n).applyMatrix4(versLocal)
        centres.push(v.x, v.y, v.z)
      }
      const geometrie = new THREE.BufferGeometry()
      geometrie.setAttribute('position', new THREE.Float32BufferAttribute(centres, 3))
      // Même lumière que le verre (MeshBasicMaterial : couleur en linéaire, multipliée par `lumineuse`) ; sans les effets
      // d'image (uLineaire à 0), la couleur telle quelle, comme la poussière
      const couleur = new THREE.Color(petit.couleur).multiplyScalar(petit.lumineuse ?? 1)
      const affichee = new THREE.Color(petit.couleur).getRGB(new THREE.Color(), THREE.SRGBColorSpace)
      const matiere = new THREE.ShaderMaterial({
        uniforms: {
          uCouleur: { value: new THREE.Vector3(couleur.r, couleur.g, couleur.b) },
          uCouleurAffichee: { value: new THREE.Vector3(affichee.r, affichee.g, affichee.b) },
          uTaille: { value: petit.petit! },
          uEchelle,
          ...uSortie,
        },
        vertexShader: /* glsl */ `
          uniform float uTaille;
          uniform float uEchelle;
          varying float vEclat;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            float d = max(-mv.z, 0.05);
            // face du verre tournée vers le haut : écrasée selon l'angle sous lequel on la voit
            vec3 versCamera = normalize(cameraPosition - (modelMatrix * vec4(position, 1.0)).xyz);
            float aPlat = abs(versCamera.y);
            float large = uTaille * uEchelle / d;     // largeur à l'écran (pixels)
            float epais = large * aPlat;              // épaisseur à l'écran : la plus petite dimension
            gl_PointSize = max(large, ${PX_MIN.toFixed(1)});
            // surface couverte par le verre, répartie sur le point (disque doux : ≈ 0,3 de sa surface)
            float energie = min(large * epais / (gl_PointSize * gl_PointSize * 0.3), 1.0);
            // relais avec le verre : le point prend le relais quand le verre devient trop fin
            vEclat = energie * (1.0 - smoothstep(${FONDU_DEBUT.toFixed(1)}, ${FONDU_FIN.toFixed(1)}, epais));
            if (vEclat < 0.002) gl_PointSize = 0.0;
          }`,
        fragmentShader: /* glsl */ `
          ${GLSL_SORTIE}
          uniform vec3 uCouleur, uCouleurAffichee;
          varying float vEclat;
          void main() {
            float r = length(gl_PointCoord - 0.5) * 2.0;
            float a = pow(max(1.0 - r, 0.0), 1.5);
            gl_FragColor = vec4((uLineaire > 0.5 ? uCouleur : uCouleurAffichee) * vEclat * a, 1.0);
          }`,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
      const points = new THREE.Points(geometrie, matiere)
      points.renderOrder = 6
      points.frustumCulled = false
      points.raycast = () => null
      mesh.add(points)
      dessinsDirects.add(points)
      ajoutes.push(points)
    })
    return () => {
      for (const p of ajoutes) {
        dessinsDirects.delete(p)
        p.removeFromParent()
        p.geometry.dispose()
        ;(p.material as THREE.Material).dispose()
      }
    }
  }, [scene, petits, uEchelle])

  // Pixels par mètre à 1 m (image finale : les points sont dessinés après la réduction)
  useFrame(() => {
    uSurEchantillonnage.value = surEchantillonnage.echelle
    uEchelle.value = (size.height * viewport.dpr * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)
  })
  return null
}

/**
 * Suréchantillonnage en cours (Effets.tsx), pour le relais côté verre (`eclatSelonTaille`, Salle.tsx) : le verre est
 * dessiné dans l'image agrandie, ses pixels sont plus petits que ceux de l'image finale
 */
export const uSurEchantillonnage = { value: 1 }
