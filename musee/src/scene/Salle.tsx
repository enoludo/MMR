import { useEffect, useMemo, useRef, type RefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { AMBIANCE_CHAUDE, PARTIE_COULEURS, appliquerCouleurs, schemaCouleurs } from '../salles/couleurs'
import { reglagesSalle, useReglagesSalle } from '../reglages'
import { sansReflets } from '../renoncements'
import { Faisceau, tableFaisceau } from './Faisceau'
import { Poussiere } from './Poussiere'
import { OeuvreVerre } from './OeuvreVerre'
import { dessinsDirects } from './Effets'
import { FONDU_DEBUT, FONDU_FIN, PetitesLumieres, uSurEchantillonnage } from './PetitesLumieres'
import { EclairageDirect } from './EclairageDirect'
import { MAX_PORTES, appliquerPierre, creerUniformsJoints, creerUniformsLueur, creerUniformsSalle, reglerPierre, uniformsOmbres, type UniformsJoints, type UniformsLueur } from './pierre'
import { etatIncandescence } from './incandescence'
import { configActuelle, configArriveeLue, groupesSalles, poidsArrivee, salleActuelle, salleArrivee } from './passage'
import { prechargerLightmaps, useLightmaps } from './lightmaps'
import { CALQUE_REFLET, PasseReflet, creerUniformsReflet, preparerSculpture, type UniformsSculpture } from './Reflet'

/**
 * Touche M, « Salle · <salle> » : exposition de l'image (mélangée entre deux salles pendant un
 * passage, voir Eclairage) et pierre. Texture de la pierre réduite de moitié le 31/10 (demande de
 * Ludovic : 0,05 / 0,035 / 0,07 avant), comme dans les couloirs (Couloir.tsx).
 */
const REGLAGES_SALLE = {
  exposition: { value: 3.4, min: 0.5, max: 15, step: 0.1 },
  lumiere: { value: 1, min: 0.2, max: 3, step: 0.01, label: 'lumière' },
  grain: { value: 0.025, min: 0, max: 0.3, step: 0.005, label: 'grain fin' },
  voile: { value: 0.0175, min: 0, max: 0.3, step: 0.005, label: 'voile' },
  nuances: { value: 0.035, min: 0, max: 0.4, step: 0.005, label: 'nuances' },
  // Ombres précalculées (06/11, demande de Ludovic ; voir UniformsOmbres, pierre.ts)
  ombres: { value: 1, min: 0.2, max: 2, step: 0.01, label: 'toutes les ombres' },
  ombreStatue: { value: 1, min: 0, max: 1, step: 0.01, label: 'ombre de la statue' },
}

/** Touche M, « Lumière sculpture · <salle> » : soleil et ambiance de l'œuvre (Eclairage) */
const LUMIERE_SCULPTURE = {
  soleil: { value: 0.55, min: 0, max: 3, step: 0.01 },
  ambiance: { value: 0.65, min: 0, max: 2, step: 0.01 },
}

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
  // Tout part en même temps : sinon chaque fichier n'est demandé qu'une fois le précédent arrivé
  prechargerSalle(config)
  const gltf = useGLTF(config.modele)
  const scene = useMemo(() => gltf.scene.clone(), [gltf.scene])
  const racine = useRef<THREE.Group>(null)
  const nomsLightmaps = Object.keys(config.lightmaps)
  const textures = useLightmaps(nomsLightmaps.map((n) => config.lightmaps[n].image))
  // Rapports avec / sans la statue (même chargement que les lightmaps : octets lus tels quels)
  const nomsRapports = nomsLightmaps.filter((n) => config.lightmaps[n].ombreStatue)
  const rapports = useLightmaps(nomsRapports.map((n) => config.lightmaps[n].ombreStatue!))
  const uOmbres = uniformsOmbres(config.id)

  const r = useReglagesSalle(config, 'Salle', REGLAGES_SALLE)
  // Couleurs de la salle (soleil, ambiance, lueur, matières), écrites dans sa config
  const couleurs = useReglagesSalle(config, PARTIE_COULEURS, schemaCouleurs(config))
  appliquerCouleurs(config, couleurs)

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

  // Joints du sol (pavillon), réglés par ReglagesJoints
  const uJoints = useMemo(creerUniformsJoints, [])
  // Lueur de l'œuvre sur la salle (pavillon), réglée par LueurOeuvre
  const uLueur = useMemo(creerUniformsLueur, [])

  // Reflet de la sculpture au sol (uniforms partagés avec la passe de reflet)
  const uReflet = useMemo(creerUniformsReflet, [])
  const reflet = useReglagesSalle(config, 'Reflet au sol', {
    force: { value: 0.16, min: 0, max: 1, step: 0.01 },
    flou: { value: 10, min: 1, max: 30, step: 0.5, label: 'flou (px)' },
    longueur: { value: 1.4, min: 0.2, max: 6, step: 0.05, label: 'atténuation (m)' },
  })
  useEffect(() => {
    uReflet.uFlouReflet.value = reflet.flou
  }, [uReflet, reflet.flou])
  // Pas de reflet pour une œuvre sur socle (le socle en cache le pied), ni quand la machine peine
  // (renoncements.ts) : à force nulle, la passe du reflet n'est plus dessinée (Reflet.tsx)
  useFrame(() => {
    uReflet.uForceReflet.value = config.sculpture.reflet === false || sansReflets() ? 0 : reflet.force
  })

  // Image de la salle vue depuis l'œuvre (EnvSalle), reflétée par les matières en métal (le verre de l’œuvre la lisait aussi du 09/11, retiré avec les poumons v2 à la demande de Ludovic)
  const gl = useThree((s) => s.gl)
  const avecMetal = Object.values(config.matieres).some((m) => m.metal)
  const avecEnv = avecMetal
  const envSalle = useMemo(() => (avecEnv ? creerEnvSalle(gl) : null), [avecEnv, gl])
  useEffect(() => () => envSalle?.dispose(), [envSalle])

  const materiaux = useMemo(() => {
    const parNom: Record<string, THREE.Texture> = {}
    nomsLightmaps.forEach((n, i) => {
      parNom[n] = textures[i] // encodage logarithmique, décodé dans le shader (voir lightmaps.ts)
    })
    const m: Record<string, THREE.MeshBasicMaterial | THREE.MeshStandardMaterial> = {}
    for (const [nom, { couleur, lightmap, lumineuse, metal, petit }] of Object.entries(config.matieres)) {
      if (metal) {
        // Métal (aluminium du pavillon, 09/11) : éclairé en direct, il reflète la salle (MetalSalle)
        m[nom] = new THREE.MeshStandardMaterial({
          color: couleur,
          metalness: 1,
          roughness: metal.rugosite,
          envMap: envSalle?.texture ?? null,
          envMapIntensity: metal.reflets ?? 1,
        })
        m[nom].name = nom
        continue
      }
      if (lumineuse !== undefined || !lightmap) {
        // Paroi lumineuse (fentes de la rotonde) : sans lightmap ni grain, comme l'émission de Blender
        m[nom] = new THREE.MeshBasicMaterial({ color: new THREE.Color(couleur).multiplyScalar(lumineuse ?? 1) })
        m[nom].name = nom
        if (petit) eclatSelonTaille(m[nom], petit)
        continue
      }
      m[nom] = new THREE.MeshBasicMaterial({ lightMap: parNom[lightmap], color: couleur })
      m[nom].name = nom // garde le nom : l'effet ci-dessous peut repasser sur un matériau déjà remplacé
      m[nom].userData.lightmap = config.lightmaps[lightmap]
      appliquerPierre(
        m[nom],
        { grain: 0, voile: 0, nuances: 0 },
        config.lightmaps[lightmap],
        uSalle,
        SOLS.includes(nom) ? uReflet : undefined,
        uOmbres,
        nomsRapports.includes(lightmap) ? rapports[nomsRapports.indexOf(lightmap)] : undefined,
        config.joints?.matieres.includes(nom) ? uJoints : undefined,
        config.lueurOeuvre ? uLueur : undefined,
      )
    }
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textures, rapports, config, uSalle, envSalle])

  useEffect(() => {
    for (const m of Object.values(materiaux)) {
      if (!m.userData.lightmap || !(m instanceof THREE.MeshBasicMaterial)) continue
      // MeshBasicMaterial divise la lightmap par π : on compense
      m.lightMapIntensity = m.userData.lightmap.echelle * Math.PI * r.lumiere
      reglerPierre(m, r)
    }
    uOmbres.uOmbres.value = r.ombres
    uOmbres.uStatue.value = r.ombreStatue
    // Pivot : la lumière la plus vive de l'architecture (échelle de sa lightmap)
    uOmbres.uPivot.value = (config.lightmaps.salle ?? Object.values(config.lightmaps)[0]).echelle
  }, [materiaux, r, uOmbres, config.lightmaps])
  useEffect(() => {
    for (const [nom, m] of Object.entries(materiaux)) {
      const { couleur, lumineuse } = config.matieres[nom]
      m.color.set(couleur)
      if (lumineuse !== undefined) m.color.multiplyScalar(lumineuse)
    }
  }, [materiaux, config, couleurs])

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
      {config.joints && <ReglagesJoints config={config} uJoints={uJoints} />}
      {config.lueurOeuvre && <LueurOeuvre config={config} uLueur={uLueur} />}
      {Object.values(config.matieres).some((m) => m.petit) && <PetitesLumieres config={config} scene={scene} />}
      {envSalle && <EnvSalle env={envSalle} materiaux={materiaux} scene={scene} racine={racine} />}
      {avecMetal && <ReglagesMetal config={config} materiaux={materiaux} />}
      {import.meta.env.DEV && config.eclairage && (
        <EclairageDirect config={config} scene={scene} uSalle={uSalle} lumiere={r.lumiere} />
      )}
      <Ciel config={config} />
      {config.sculpture.modele &&
        (config.sculpture.verre ? (
          <OeuvreVerre config={config} modele={config.sculpture.modele} uSol={uReflet} longueurReflet={reflet.longueur} />
        ) : (
          <Sculpture config={config} modele={config.sculpture.modele} uSol={uReflet} longueurReflet={reflet.longueur} />
        ))}
      {config.sculpture.lueur && <Lueur config={config} lueur={config.sculpture.lueur} />}
      {config.faisceau !== false && (
        <>
          <Faisceau config={config} />
          <Poussiere config={config} />
        </>
      )}
    </group>
  )
}

/**
 * Lueur au pied d'un socle : un ruban lumineux caché dans la gorge du socle (GORGE_H, GORGE_R dans
 * blender/salle.py) et son halo sur le sol. La lumière du ruban est aussi précalculée, mais elle se
 * perd dans la tache du puits (et elle est écrêtée, voir lightmap.py) : ruban et halo la font lire.
 */
function Lueur({ config, lueur }: { config: SalleConfig; lueur: { rayon: number; couleur: string } }) {
  const l = useReglagesSalle(config, 'Lueur du socle', {
    ruban: { value: 6, min: 0, max: 20, step: 0.1 },
    halo: { value: 0.3, min: 0, max: 3, step: 0.01 },
    etendue: { value: 0.1, min: 0.02, max: 1, step: 0.01, label: 'étendue du halo (m)' },
  })
  const ruban = useMemo(() => new THREE.MeshBasicMaterial(), [])
  const halo = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uCouleur: { value: new THREE.Color() }, uRayon: { value: 1 }, uEtendue: { value: 0.2 } },
        vertexShader: /* glsl */ `
          varying vec2 vPlan;
          void main() {
            vPlan = position.xy;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uCouleur;
          uniform float uRayon, uEtendue;
          varying vec2 vPlan;
          void main() {
            float d = max(length(vPlan) - uRayon, 0.0);
            gl_FragColor = vec4(uCouleur * exp(-d / uEtendue), 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      }),
    [],
  )
  ruban.color.set(lueur.couleur).multiplyScalar(l.ruban)
  halo.uniforms.uCouleur.value.set(lueur.couleur).multiplyScalar(l.halo)
  halo.uniforms.uRayon.value = lueur.rayon
  halo.uniforms.uEtendue.value = l.etendue
  return (
    <group position={[config.sculpture.position[0], 0, config.sculpture.position[2]]}>
      {/* Ruban : contre le pied du socle, au fond de la gorge (12 cm de haut, 10 de profondeur), sur
          presque toute sa hauteur : c'est lui qu'on voit sous le débord, en trait de lumière */}
      <mesh material={ruban} position-y={0.065}>
        <cylinderGeometry args={[lueur.rayon + 0.004, lueur.rayon + 0.004, 0.09, 96, 1, true]} />
      </mesh>
      <mesh material={halo} rotation-x={-Math.PI / 2} position-y={0.003} renderOrder={4}>
        <ringGeometry args={[lueur.rayon, lueur.rayon + 1.5, 96, 1]} />
      </mesh>
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
  modele,
  uSol,
  longueurReflet,
}: {
  config: SalleConfig
  modele: string
  uSol: ReturnType<typeof creerUniformsReflet>
  longueurReflet: number
}) {
  const gltf = useGLTF(modele)
  // Copie avec ses propres matières : chaque salle chargée règle son reflet séparément
  const scene = useMemo(() => {
    const copie = gltf.scene.clone()
    copie.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) mesh.material = (mesh.material as THREE.Material).clone()
    })
    return copie
  }, [gltf.scene])

  const s = useReglagesSalle(config, 'Sculpture', {
    orientation: { value: config.sculpture.rotationY, min: -180, max: 180, step: 0.5, label: 'orientation (°)' },
    teinte: { value: '#ddd8d2' },
    rugosite: { value: 0.85, min: 0, max: 1, step: 0.01, label: 'rugosité' },
    relief: { value: 1, min: 0, max: 3, step: 0.05 },
    occlusion: { value: 0.9, min: 0, max: 1, step: 0.01, label: 'occlusion (creux, pieds)' },
    occlusionDirecte: { value: 0.35, min: 0, max: 1, step: 0.01, label: 'occlusion sur le soleil' },
  })
  useReglagesSalle(config, 'Lumière sculpture', LUMIERE_SCULPTURE) // lue à chaque image par Eclairage

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
  // Ambiance de l'œuvre : pendant un passage, elle glisse de celle de la salle quittée à celle de la
  // salle d'arrivée selon la distance de la caméra à chacune (sinon elle basculerait d'un coup)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const camera = useThree((e) => e.camera)
  const gl = useThree((e) => e.gl)
  const tmp = useMemo(() => ({ a: new THREE.Color(), b: new THREE.Color() }), [])
  // Les salles se lisent dans l'état à chaque image, pas dans les propriétés : à la fin d'un passage,
  // la salle d'arrivée devient la salle actuelle dans l'image même (Navigation.arriver), avant que
  // la page ne suive ; sinon l'œuvre reprenait un instant la lumière de la salle quittée
  useFrame(() => {
    const h = hemi.current
    if (!h) return
    const ca = configActuelle() ?? config
    const cb = configArriveeLue()
    const w = poidsArrivee(camera)
    const amb = (c: SalleConfig | null | undefined) => c?.ambiance ?? AMBIANCE_CHAUDE
    h.color.copy(tmp.a.set(amb(ca).ciel)).lerp(tmp.b.set(amb(cb).ciel), w)
    h.groundColor.copy(tmp.a.set(amb(ca).sol)).lerp(tmp.b.set(amb(cb).sol), w)
    // Force de l'ambiance et exposition de l'image : celles de chaque salle, mélangées de même
    const lb = cb ? reglagesSalle(cb, 'Lumière sculpture', LUMIERE_SCULPTURE) : null
    const la = reglagesSalle(ca, 'Lumière sculpture', LUMIERE_SCULPTURE)
    h.intensity = melange(la.ambiance, lb?.ambiance ?? la.ambiance, w)
    const ea = reglagesSalle(ca, 'Salle', REGLAGES_SALLE).exposition
    gl.toneMappingExposure = melange(ea, cb ? reglagesSalle(cb, 'Salle', REGLAGES_SALLE).exposition : ea, w)
  })
  return (
    <>
      <Soleil config={config} suivre={salleActuelle} lire={configActuelle} />
      <Soleil config={config} suivre={salleArrivee} lire={configArriveeLue} />
      {/* Ambiance froide en haut, chaude en bas (ciel + rebonds sur la pierre), selon la salle où l'on est */}
      <hemisphereLight
        ref={hemi}
        args={[AMBIANCE_CHAUDE.ciel, AMBIANCE_CHAUDE.sol, LUMIERE_SCULPTURE.ambiance.value]}
        onUpdate={(h) => h.layers.enable(CALQUE_REFLET)}
      />
    </>
  )
}

const melange = (a: number, b: number, w: number) => a + (b - a) * w


/**
 * Le soleil du puits, pour la sculpture : un spot lointain dans l'axe du soleil, à découpe
 * carrée (la forme du puits), qui projette des ombres sur la sculpture elle-même ; calé sur
 * le précalcul. Il suit la salle donnée par `suivre`, et s'éteint quand il n'y en a pas.
 */
function Soleil({
  config,
  suivre,
  lire,
}: {
  /** Salle par défaut, quand `lire` n'en donne pas */
  config: SalleConfig
  suivre: () => THREE.Group | undefined
  /**
   * Config de la salle suivie, lue à chaque image : géométrie (puits, direction, lames), force et
   * couleur de son soleil. Les salles n'ont plus toutes le même soleil (rotonde) : celui de la salle
   * d'arrivée doit être le sien dès le passage, sinon il changeait d'un coup à l'arrivée (31/10).
   */
  lire: () => SalleConfig | undefined
}) {
  const groupe = useRef<THREE.Group>(null)
  const { spot, cible, distance } = useMemo(() => {
    // Lointain, pour que ses rayons soient presque parallèles : la découpe (puits, lames) garde
    // ainsi sa taille du plafond jusqu'au sol, comme dans le précalcul
    const distance = 300
    const spot = new THREE.SpotLight()
    const cible = new THREE.Object3D()
    spot.target = cible
    spot.penumbra = 0
    spot.decay = 2
    spot.distance = 0
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
  }, [])

  // Géométrie du soleil de la salle suivie, refaite seulement quand elle change (même spot et même ombre :
  // une salle qui ne change que la couleur du soleil, ou la même salle, ne recalcule rien)
  const geometrie = useRef<SalleConfig['soleil'] | null>(null)
  const placer = (soleil: SalleConfig['soleil']) => {
    const g = geometrie.current
    if (g && g.direction === soleil.direction && g.puits === soleil.puits && g.ouverture === soleil.ouverture && g.lames === soleil.lames)
      return
    geometrie.current = soleil
    const dir = new THREE.Vector3(...soleil.direction).normalize()
    const puits = new THREE.Vector3(...soleil.puits)
    spot.position.copy(puits).addScaledVector(dir, -distance)
    cible.position.copy(puits).addScaledVector(dir, puits.y / -dir.y)
    // Cône juste assez large pour contenir la section du faisceau ; sa découpe vient de la « map »
    const [ox, oz] = soleil.ouverture
    const demi = (Math.max(ox, oz) / 2) * Math.SQRT2 * 1.3
    spot.angle = Math.atan(demi / distance)
    let map = decoupes.get(soleil)
    if (!map) decoupes.set(soleil, (map = decoupe(soleil, demi)))
    spot.map = map
  }
  if (!geometrie.current) placer(config.soleil)

  useFrame(() => {
    const g = suivre()
    if (g && groupe.current) {
      groupe.current.position.copy(g.position)
      groupe.current.rotation.copy(g.rotation)
    }
    // Même éclairement que le soleil de Blender : I = E × d² ; éteint (et non retiré) sans salle
    const c = lire() ?? config
    placer(c.soleil)
    const force = reglagesSalle(c, 'Lumière sculpture', LUMIERE_SCULPTURE).soleil // celle de la salle suivie
    spot.intensity = g ? c.soleil.force * distance * distance * force : 0
    spot.color.set(c.soleil.couleur)
  }, -1.8) // après le recalage de l'arrivée (navigation), avant la passe de reflet

  return (
    <group ref={groupe}>
      <primitive object={spot} />
      <primitive object={cible} />
    </group>
  )
}

/** Découpe de chaque soleil, faite une fois (partagée par les deux soleils : salle actuelle, salle d'arrivée) */
const decoupes = new WeakMap<SalleConfig['soleil'], THREE.CanvasTexture>()

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
  if (soleil.forme === 'rond') {
    ctx.beginPath()
    ctx.ellipse(colonne(cx), ligne(cz), (n * ox) / (4 * demi), (n * oz) / (4 * demi), 0, 0, 2 * Math.PI)
    ctx.fill()
  } else {
    ctx.fillRect(colonne(cx + ox / 2), ligne(cz + oz / 2), (n * ox) / (2 * demi), (n * oz) / (2 * demi))
  }
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

const prechargees = new Set<string>()

/**
 * Télécharge (et décode) à l'avance tout ce que charge une salle, en parallèle : depuis la spirale
 * (transition.ts), pour les salles voisines pendant la visite (Experience), et au montage de la salle.
 */
export function prechargerSalle(config: SalleConfig) {
  if (prechargees.has(config.id)) return
  prechargees.add(config.id)
  useGLTF.preload(config.modele)
  if (config.sculpture.modele) useGLTF.preload(config.sculpture.modele)
  if (config.faisceau !== false) tableFaisceau(config.soleil)
  prechargerLightmaps(Object.values(config.lightmaps).flatMap((l) => (l.ombreStatue ? [l.image, l.ombreStatue] : [l.image])))
}

/** Touche M, « Joints du sol · <salle> » : dimensions et force des joints dessinés sur le sol (pierre.ts) */
function ReglagesJoints({ config, uJoints }: { config: SalleConfig; uJoints: UniformsJoints }) {
  const j = config.joints!
  const v = useReglagesSalle(config, 'Joints du sol', {
    longueur: { value: j.longueur, min: 0.2, max: 4, step: 0.05, label: 'longueur des dalles (m)' },
    largeur: { value: j.largeur, min: 0.2, max: 4, step: 0.05, label: 'largeur des dalles (m)' },
    joint: { value: j.joint, min: 0, max: 0.03, step: 0.001, label: 'épaisseur du joint (m)' },
    force: { value: j.force, min: 0, max: 1, step: 0.01, label: 'force du joint' },
    angle: { value: j.angle, min: 0, max: 90, step: 1, label: 'orientation (°)' },
    decalage: { value: j.decalage ?? 0, min: 0, max: 0.5, step: 0.01, label: 'décalage des rangs (0 : alignées)' },
  })
  uJoints.uJointsDecalage.value = v.decalage
  uJoints.uJoints.value.set(v.longueur, v.largeur, v.joint, v.force)
  uJoints.uJointsAngle.value = THREE.MathUtils.degToRad(v.angle)
  return null
}

/**
 * Touche M, « Lueur de l'œuvre · <salle> » : lumière de l'œuvre ajoutée sur la salle, qui suit la chaleur de ses
 * bronches incandescentes (incandescence.ts) à chaque image
 */
function LueurOeuvre({ config, uLueur }: { config: SalleConfig; uLueur: UniformsLueur }) {
  const l = config.lueurOeuvre!
  const v = useReglagesSalle(config, 'Lueur de l’œuvre', {
    force: { value: l.force, min: 0, max: 2, step: 0.005, label: 'force' },
    portee: { value: l.portee, min: 0.5, max: 15, step: 0.1, label: 'portée (m)' },
    couleur: { value: l.couleur, label: 'couleur' },
  })
  const couleur = useMemo(() => new THREE.Color(), [])
  uLueur.uLueurPos.value.set(...l.position)
  uLueur.uLueurPortee.value = v.portee
  useFrame(() => {
    uLueur.uLueurCouleur.value.copy(couleur.set(v.couleur)).multiplyScalar(v.force * etatIncandescence.chaleur)
  })
  return null
}

/**
 * Image de l'environnement des matières en métal (09/11, aluminium du pavillon) : la salle vue depuis un point au
 * centre (six vues, `CubeCamera`), convertie par three pour les reflets flous (PMREM). Prête dès la création (noire,
 * déjà convertie une fois) : les matières sont compilées avec leurs reflets, sans recompiler à la première prise.
 */
function creerEnvSalle(gl: THREE.WebGLRenderer) {
  const env = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false })
  gl.initRenderTarget(env)
  const avant = gl.getRenderTarget()
  for (let face = 0; face < 6; face++) {
    gl.setRenderTarget(env, face)
    gl.clear()
  }
  gl.setRenderTarget(avant)
  env.texture.needsPMREMUpdate = true
  return env
}

/**
 * Point de la prise de vue des reflets, dans le repère de la salle : au milieu de l'œuvre (09/11 ; 0,7 m pour le
 * métal seul), d'où le verre la voit ; l'écart pour la barrière et le pupitre, plus bas, se remarque à peine
 */
const POINT_ENV = new THREE.Vector3(0, 2, 0)

/**
 * Réglages du métal de la salle (touche M, « Métal · <salle> » : rugosité, reflets ; sa couleur est dans « Couleurs »)
 */
function ReglagesMetal({ config, materiaux }: { config: SalleConfig; materiaux: Record<string, THREE.Material> }) {
  const noms = useMemo(() => Object.keys(config.matieres).filter((n) => config.matieres[n].metal), [config])
  const d = config.matieres[noms[0]].metal!
  const r = useReglagesSalle(config, 'Métal', {
    rugosite: { value: d.rugosite, min: 0, max: 1, step: 0.01, label: 'rugosité' },
    reflets: { value: d.reflets ?? 1, min: 0, max: 4, step: 0.05, label: 'force des reflets' },
  })
  useEffect(() => {
    for (const n of noms) {
      const m = materiaux[n] as THREE.MeshStandardMaterial
      m.roughness = r.rugosite
      m.envMapIntensity = r.reflets
    }
  }, [materiaux, noms, r])
  return null
}

/**
 * Prise de vue de l'environnement de la salle (métal, verre de l'œuvre) : quelques images après le montage, puis de
 * nouveau quand la salle change de place (salle d'arrivée d'un passage, recalée à l'origine à l'arrivée). Sont cachés
 * pendant la prise : les objets en métal et l'œuvre de verre (ils ne peuvent pas lire l'image qu'on écrit ; marqués
 * `userData.horsEnv` pour l'œuvre), et la poussière.
 */
function EnvSalle({
  env,
  materiaux,
  scene,
  racine,
}: {
  env: THREE.WebGLCubeRenderTarget
  materiaux: Record<string, THREE.Material>
  scene: THREE.Object3D
  racine: RefObject<THREE.Group | null>
}) {
  const gl = useThree((s) => s.gl)
  const monde = useThree((s) => s.scene)
  const metaux = useMemo(
    () => new Set(Object.values(materiaux).filter((m) => (m as THREE.MeshStandardMaterial).isMeshStandardMaterial)),
    [materiaux],
  )
  const camera = useMemo(() => new THREE.CubeCamera(0.05, 150, env), [env])
  const etat = useRef({ images: 0, place: new THREE.Matrix4() })
  useFrame(() => {
    const g = racine.current
    if (!g) return
    const e = etat.current
    if (!g.matrixWorld.equals(e.place)) {
      e.place.copy(g.matrixWorld)
      e.images = 0
    }
    if (++e.images !== 4) return
    camera.position.copy(POINT_ENV).applyMatrix4(g.matrixWorld)
    const caches: THREE.Object3D[] = []
    const cacher = (o: THREE.Object3D) => {
      if (o.visible) {
        o.visible = false
        caches.push(o)
      }
    }
    scene.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh && metaux.has(mesh.material as THREE.Material)) cacher(mesh)
    })
    g.traverse((o) => {
      if (o.userData.horsEnv) cacher(o)
    })
    for (const o of dessinsDirects) cacher(o)
    camera.update(gl, monde)
    for (const o of caches) o.visible = true
    env.texture.needsPMREMUpdate = true
  })
  return null
}

/**
 * Petit objet lumineux (spots encastrés du pavillon, 09/11) : de loin et vu à plat, il ne couvre plus qu'un pixel ou
 * moins et clignote. Il s'éteint quand son épaisseur à l'écran (taille de l'objet sur la taille d'un pixel à sa
 * surface, dans la direction la plus écrasée, ramenée aux pixels de l'image finale) passe sous FONDU_FIN pixels ; un
 * point lumineux de taille stable prend le relais (PetitesLumieres.tsx).
 */
function eclatSelonTaille(m: THREE.MeshBasicMaterial, taille: number) {
  m.onBeforeCompile = (s) => {
    s.uniforms.uTaillePetit = { value: taille }
    s.uniforms.uSurEchantillonnage = uSurEchantillonnage
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosPetit;')
      .replace('#include <fog_vertex>', '#include <fog_vertex>\nvPosPetit = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPosPetit;\nuniform float uTaillePetit, uSurEchantillonnage;')
      .replace(
        '#include <opaque_fragment>',
        `float piedPixel = max(length(dFdx(vPosPetit)), length(dFdy(vPosPetit)));
        float epaisPx = uTaillePetit / max(piedPixel, 1e-6) / max(uSurEchantillonnage, 1.0);
        outgoingLight *= smoothstep(${FONDU_DEBUT.toFixed(1)}, ${FONDU_FIN.toFixed(1)}, epaisPx);
        #include <opaque_fragment>`,
      )
  }
  m.customProgramCacheKey = () => 'petit'
}

