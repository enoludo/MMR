import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { Faisceau } from './Faisceau'
import { Poussiere } from './Poussiere'
import { MAX_PORTES, appliquerPierre, creerUniformsSalle, reglerPierre } from './pierre'
import { store } from '../store'
import { groupesSalles } from './passage'
import { prechargerLightmaps, useLightmaps } from './lightmaps'
import { CALQUE_REFLET, PasseReflet, creerUniformsReflet, preparerSculpture, type UniformsSculpture } from './Reflet'

/** Matières du sol : elles reçoivent le reflet de la sculpture */
const SOLS = ['Sol', 'SolCentre']

/**
 * Une salle : géométrie + lumière précalculée + sculpture.
 *
 * Les surfaces de la salle ne calculent aucun éclairage dans le navigateur
 * (MeshBasicMaterial) : couleur = pierre procédurale (voir pierre.ts) × lumière
 * précalculée dans Blender (lightmap). C'est ce qui permet une lumière riche et douce
 * pour un coût quasi nul. Seule la sculpture est éclairée en temps réel (voir Eclairage).
 *
 * Deux salles peuvent être chargées en même temps (pendant un passage d'une salle à
 * l'autre) : chacune a sa copie des modèles et ses matières, et tout ce qui dépend de
 * la position est calculé dans son repère à elle (voir pierre.ts, Faisceau, Poussière).
 */
export function Salle({ config }: { config: SalleConfig }) {
  const gltf = useGLTF(config.modele)
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene])
  const racine = useRef<THREE.Group>(null)
  const nomsLightmaps = Object.keys(config.lightmaps)
  const textures = useLightmaps(nomsLightmaps.map((n) => config.lightmaps[n].image))

  const r = useControls('Salle', {
    lumiere: { value: 1, min: 0.2, max: 3, step: 0.01, label: 'lumière' },
    grain: { value: 0.05, min: 0, max: 0.3, step: 0.005, label: 'grain fin' },
    voile: { value: 0.035, min: 0, max: 0.3, step: 0.005, label: 'voile' },
    nuances: { value: 0.07, min: 0, max: 0.4, step: 0.005, label: 'nuances' },
  })

  // Repère de la salle et portes, communs à ses matières
  const uSalle = useMemo(creerUniformsSalle, [])
  useEffect(() => {
    const portes = config.portes.slice(0, MAX_PORTES)
    portes.forEach((porte, i) => {
      uSalle.uPortePos.value[i].set(...porte.position)
      uSalle.uPorteDir.value[i].set(...porte.direction).normalize()
      uSalle.uPorteTaille.value[i].set(porte.largeur / 2, porte.hauteur)
    })
    uSalle.uNbPortes.value = portes.length
  }, [uSalle, config.portes])
  useFrame(() => {
    if (racine.current) uSalle.uVersSalle.value.copy(racine.current.matrixWorld).invert()
  })

  // Reflet de la sculpture au sol (uniforms partagés avec la passe de reflet)
  const uReflet = useMemo(creerUniformsReflet, [])
  const reflet = useControls('Reflet au sol', {
    force: { value: 0.16, min: 0, max: 1, step: 0.01 },
    flou: { value: 10, min: 1, max: 30, step: 0.5, label: 'flou (px)' },
    longueur: { value: 1.4, min: 0.2, max: 6, step: 0.05, label: 'atténuation (m)' },
  })
  useEffect(() => {
    uReflet.uForceReflet.value = reflet.force
    uReflet.uFlouReflet.value = reflet.flou
  }, [uReflet, reflet.force, reflet.flou])

  const materiaux = useMemo(() => {
    const parNom: Record<string, THREE.Texture> = {}
    nomsLightmaps.forEach((n, i) => {
      parNom[n] = textures[i] // encodage logarithmique, décodé dans le shader (voir lightmaps.ts)
    })
    const m: Record<string, THREE.MeshBasicMaterial> = {}
    for (const [nom, { couleur, lightmap }] of Object.entries(config.matieres)) {
      m[nom] = new THREE.MeshBasicMaterial({ lightMap: parNom[lightmap], color: couleur })
      m[nom].name = nom // garde le nom : l'effet ci-dessous peut repasser sur un matériau déjà remplacé
      m[nom].userData.lightmap = config.lightmaps[lightmap]
      appliquerPierre(
        m[nom],
        { grain: 0, voile: 0, nuances: 0 },
        { k: config.lightmaps[lightmap].k },
        uSalle,
        SOLS.includes(nom) ? uReflet : undefined,
      )
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textures, config, uSalle])

  useEffect(() => {
    for (const m of Object.values(materiaux)) {
      // MeshBasicMaterial divise la lightmap par π : on compense
      m.lightMapIntensity = m.userData.lightmap.echelle * Math.PI * r.lumiere
      reglerPierre(m, r)
    }
  }, [materiaux, r])

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const nom = (mesh.material as THREE.Material).name
      mesh.material = materiaux[nom] ?? materiaux.Mur
    })
  }, [scene, materiaux])

  return (
    <group ref={racine}>
      <primitive object={scene} />
      <Ciel config={config} />
      <Sculpture config={config} uSol={uReflet} longueurReflet={reflet.longueur} />
      <Faisceau config={config} />
      <Poussiere config={config} />
    </group>
  )
}

/**
 * Le ciel aperçu par les ouvertures du plafond. Un peu au-dessus du haut des parois (et des
 * lames) et un peu plus grand que l'ouverture : posé exactement à leur niveau, il se disputait
 * l'affichage avec elles (bords crénelés qui scintillent).
 */
function Ciel({ config }: { config: SalleConfig }) {
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.9, 3.4) }), [])
  return (
    <>
      {config.ciel.map((c, i) => (
        <mesh
          key={i}
          position={[c.centre[0], c.centre[1] + DECOLLEMENT_CIEL, c.centre[2]]}
          rotation-x={Math.PI / 2}
          material={mat}
          userData={{ traversable: true }}
        >
          <planeGeometry args={[c.taille[0] + 0.4, c.taille[1] + 0.4]} />
        </mesh>
      ))}
    </>
  )
}

/** Écart entre le ciel et le haut des ouvertures (m) */
const DECOLLEMENT_CIEL = 0.05

function Sculpture({
  config,
  uSol,
  longueurReflet,
}: {
  config: SalleConfig
  uSol: ReturnType<typeof creerUniformsReflet>
  longueurReflet: number
}) {
  const gltf = useGLTF(config.sculpture.modele)
  // Copie avec ses propres matières : chaque salle chargée règle son reflet séparément
  const scene = useMemo(() => {
    const copie = gltf.scene.clone()
    copie.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone()
    })
    return copie
  }, [gltf.scene])

  const s = useControls('Sculpture', {
    orientation: { value: config.sculpture.rotationY, min: -180, max: 180, step: 0.5, label: 'orientation (°)' },
    teinte: { value: '#ddd8d2' },
    rugosite: { value: 0.85, min: 0, max: 1, step: 0.01, label: 'rugosité' },
    relief: { value: 1, min: 0, max: 3, step: 0.05 },
    occlusion: { value: 0.9, min: 0, max: 1, step: 0.01, label: 'occlusion (creux, pieds)' },
    occlusionDirecte: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'occlusion sur le soleil' },
  })

  const uSculpture = useMemo<UniformsSculpture>(
    () => ({
      uOcclusion: { value: 0.9 },
      uOcclusionDirecte: { value: 0.35 },
      uReflet: { value: 0 },
      uLongueurReflet: { value: 1.4 },
    }),
    [],
  )
  uSculpture.uOcclusion.value = s.occlusion
  uSculpture.uOcclusionDirecte.value = s.occlusionDirecte
  uSculpture.uLongueurReflet.value = longueurReflet

  const materiaux = useMemo(() => {
    const liste: THREE.MeshStandardMaterial[] = []
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      const m = mesh.material as THREE.MeshStandardMaterial
      if (!liste.includes(m)) {
        preparerSculpture(m, uSculpture)
        liste.push(m)
      }
    })
    scene.traverse((o) => o.layers.enable(CALQUE_REFLET)) // la sculpture se reflète au sol
    return liste
  }, [scene, uSculpture])

  useEffect(() => {
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = mesh.receiveShadow = true
      const m = mesh.material as THREE.MeshStandardMaterial
      m.color.set(s.teinte)
      m.roughness = s.rugosite
      m.normalScale.setScalar(s.relief)
      m.side = THREE.FrontSide
    })
  }, [scene, s.teinte, s.rugosite, s.relief])

  return (
    <>
      <primitive
        object={scene}
        position={config.sculpture.position}
        scale={config.sculpture.echelle ?? 1}
        rotation-y={THREE.MathUtils.degToRad(s.orientation)}
      />
      <PasseReflet sculpture={scene} materiaux={materiaux} uSol={uSol} uSculpture={uSculpture} />
    </>
  )
}

/**
 * Éclairage de l'œuvre, pour toute la scène : un soleil qui suit la salle où l'on se trouve,
 * un second qui suit la salle d'arrivée pendant un passage (éteint le reste du temps), et
 * une seule lumière d'ambiance.
 * Le nombre de lumières ne change jamais : avec un jeu de lumières par salle, l'œuvre
 * d'arrivée recevait aussi l'ambiance de la salle de départ, qui s'éteignait d'un coup à
 * l'arrivée (et toutes les matières étaient recompilées).
 */
export function Eclairage({ config }: { config: SalleConfig }) {
  const l = useControls('Lumière sculpture', {
    soleil: { value: 0.55, min: 0, max: 3, step: 0.01 },
    ambiance: { value: 0.65, min: 0, max: 2, step: 0.01 },
  })
  return (
    <>
      <Soleil config={config} force={l.soleil} suivre={salleActuelle} />
      <Soleil config={config} force={l.soleil} suivre={salleArrivee} />
      {/* Ambiance froide en haut, chaude en bas (ciel + rebonds sur la pierre) : identique partout */}
      <hemisphereLight
        args={['#a9bde0', '#76675a', l.ambiance]}
        onUpdate={(h) => h.layers.enable(CALQUE_REFLET)}
      />
    </>
  )
}

const salleActuelle = () => {
  const v = store.get().salle
  return v ? groupesSalles.get(v.cle) : undefined
}
const salleArrivee = () => {
  const v = store.get().passage
  return v ? groupesSalles.get(v.cle) : undefined
}

/**
 * Le soleil du puits, pour la sculpture : un spot lointain dans l'axe du soleil, à découpe
 * carrée (la forme du puits), qui projette des ombres sur la sculpture elle-même ; calé sur
 * le précalcul. Il suit la salle donnée par `suivre`, et s'éteint quand il n'y en a pas.
 */
function Soleil({
  config,
  force,
  suivre,
}: {
  config: SalleConfig
  force: number
  suivre: () => THREE.Group | undefined
}) {
  const groupe = useRef<THREE.Group>(null)
  const { spot, cible, distance } = useMemo(() => {
    const dir = new THREE.Vector3(...config.soleil.direction).normalize()
    const puits = new THREE.Vector3(...config.soleil.puits)
    // Lointain, pour que ses rayons soient presque parallèles : la découpe (puits, lames) garde
    // ainsi sa taille du plafond jusqu'au sol, comme dans le précalcul
    const distance = 300
    const spot = new THREE.SpotLight(config.soleil.couleur)
    spot.position.copy(puits).addScaledVector(dir, -distance)
    const cible = new THREE.Object3D()
    cible.position.copy(puits).addScaledVector(dir, puits.y / -dir.y)
    spot.target = cible
    // Cône juste assez large pour contenir la section du faisceau ; sa découpe vient de la « map »
    const [ox, oz] = config.soleil.ouverture
    const demi = (Math.max(ox, oz) / 2) * Math.SQRT2 * 1.3
    spot.angle = Math.atan(demi / distance)
    spot.penumbra = 0
    spot.decay = 2
    spot.distance = 0
    spot.map = decoupe(config.soleil, demi)
    spot.castShadow = true
    spot.shadow.mapSize.set(2048, 2048)
    spot.shadow.radius = 6 // bord de l'ombre adouci (ombres filtrées, voir Experience)
    spot.shadow.bias = -0.0002
    spot.shadow.normalBias = 0.04
    spot.shadow.camera.near = distance - 2
    spot.shadow.camera.far = distance + 25
    spot.shadow.camera.up.set(0, 0, 1)
    spot.layers.enable(CALQUE_REFLET) // éclaire aussi la sculpture dans la passe de reflet
    return { spot, cible, distance }
  }, [config.soleil])

  useFrame(() => {
    const g = suivre()
    if (g && groupe.current) {
      groupe.current.position.copy(g.position)
      groupe.current.rotation.copy(g.rotation)
    }
    // Même éclairement que le soleil de Blender : I = E × d² ; éteint (et non retiré) sans salle
    spot.intensity = g ? config.soleil.force * distance * distance * force : 0
  }, -1.8) // après le recalage de l'arrivée (navigation), avant la passe de reflet

  return (
    <group ref={groupe}>
      <primitive object={spot} />
      <primitive object={cible} />
    </group>
  )
}

/**
 * Texture de découpe du soleil, vue depuis lui : la section du faisceau au plafond, et les
 * ombres des lames, aux bords adoucis. `demi` : demi-largeur couverte par la texture (m).
 * Repère de la caméra d'ombre (dont le haut est +z) : la droite de l'image est vers −x.
 */
function decoupe(soleil: SalleConfig['soleil'], demi: number) {
  const n = 512
  const c = document.createElement('canvas')
  c.width = c.height = n
  const ctx = c.getContext('2d')!
  const [cx, , cz] = soleil.puits
  const colonne = (x: number) => n * (0.5 - (x - cx) / (2 * demi))
  const ligne = (z: number) => n * (0.5 - (z - cz) / (2 * demi))
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, n, n)
  ctx.filter = 'blur(48px)' // bords de la tache de soleil adoucis (soleil voilé, comme le précalcul)
  ctx.fillStyle = '#fff'
  const [ox, oz] = soleil.ouverture
  ctx.fillRect(colonne(cx + ox / 2), ligne(cz + oz / 2), (n * ox) / (2 * demi), (n * oz) / (2 * demi))
  const l = soleil.lames
  if (l) {
    // Ombres des lames (entre deux vides), ramenées au plafond le long du soleil
    const dir = new THREE.Vector3(...soleil.direction).normalize()
    const decalage = (dir.x / -dir.y) * (soleil.puits[1] - (l.bas + l.haut) / 2)
    ctx.filter = 'blur(16px)' // pénombre du soleil voilé, à mi-chemin entre les lames et le sol
    ctx.fillStyle = '#000'
    for (let i = 0; i + 1 < l.vides.length; i++) {
      const [x0, x1] = [l.vides[i][1] - decalage, l.vides[i + 1][0] - decalage]
      ctx.fillRect(colonne(x1), 0, colonne(x0) - colonne(x1), n)
    }
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

useGLTF.preload('/models/salle.glb')
useGLTF.preload('/models/sculpture.glb')

/** Télécharge (et décode) à l'avance tout ce que charge une salle (depuis la spirale, voir transition.ts). */
export function prechargerSalle(config: SalleConfig) {
  useGLTF.preload(config.modele)
  useGLTF.preload(config.sculpture.modele)
  prechargerLightmaps(Object.keys(config.lightmaps).map((n) => config.lightmaps[n].image))
}
