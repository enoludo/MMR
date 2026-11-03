import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { boutonCopier, dossierSalle, valeursEnregistrees } from '../reglages'
import { configActuelle, configArriveeLue, poidsArrivee } from './passage'
import { FLOU_DEFAUT, flouDeLaVue, vueEnCours } from '../salles/pointsDeVue'
import {
  BlendFunction,
  BloomEffect,
  DepthOfFieldEffect,
  Effect,
  EffectComposer,
  EffectPass,
  NoiseEffect,
  RenderPass,
  SMAAEffect,
  SMAAPreset,
} from 'postprocessing'

/**
 * Effets d'image (31/10, rendu plus photographique pour un coût mesuré) : l'image de la scène est
 * retravaillée (bibliothèque postprocessing de pmndrs, effets fusionnés) : profondeur de champ (mise au
 * point sur le point regardé, `regard`), halo autour des lumières vives, courbe de couleurs AgX (plus
 * proche d'une photo que la courbe ACES d'avant), anticrénelage SMAA (à la place de celui du canvas, plus
 * coûteux sur grand écran) et grain très fin. Une seule passe sans profondeur de champ, deux avec (la
 * profondeur de champ et l'anticrénelage ne peuvent pas partager une passe).
 * Le coût suit le nombre de pixels, pas la scène : retirer la texture de la pierre ne rend rien (mesuré le
 * 31/10) ; les effets en 1920 px de large tournent plus vite que la scène sans effets en 2880 px.
 * Profondeur de champ : seulement aux vues où Ludovic l'a activée, avec leurs réglages (flou, zone nette,
 * mise au point : panneau de la vue libre, salles/pointsDeVue.ts), en fondu ; calculée en demi-résolution.
 * C'est l'effet le plus coûteux (mesuré le 31/10 sur un M1 en 1920 × 1080 : 38 images/s sans effets, 33
 * avec la courbe seule, 27 avec le halo, 24 avec l'anticrénelage et le grain, 22 avec la profondeur de
 * champ seule) ; le halo est aussi calculé en demi-résolution.
 * Réglages propres à chaque salle (champ `effets` de la config, touche M « Effets · <salle> ») ; pendant un
 * passage, ils glissent de la salle quittée à la salle d'arrivée (la courbe de couleurs aussi : `Courbe`).
 * Touche M, dossier « Effets (toutes les salles) » : effets actifs, anticrénelage. Les captures (outils/capture.ts) et la photo du retour vers la
 * spirale passent par `rendu.image` : elles ont les mêmes effets que l'écran (sans le grain).
 */

/** Point regardé (repère du monde), tenu à jour par la navigation et la vue libre : la mise au point */
export const regard = new THREE.Vector3(0, 2, 0)

/**
 * Lumières ajoutées « par-dessus » l'image (faisceau dans l'air, poussière, rayons des couloirs) :
 * réglées pour s'ajouter à l'image déjà terminée (après la courbe de couleurs). Avec les effets, la
 * scène est dessinée avant la courbe : leur couleur y est ramenée (linéaire, divisée par l'exposition),
 * sinon elles voilaient toute la salle. Uniforms partagés par leurs matières.
 */
export const uSortie = { uLineaire: { value: 0 }, uExpoSortie: { value: 1 } }
export const GLSL_SORTIE = /* glsl */ `
  uniform float uLineaire;
  uniform float uExpoSortie;
  vec3 versSortie(vec3 c) {
    if (uLineaire < 0.5) return c;
    vec3 l = mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
    return l / uExpoSortie;
  }
`

/** Dessin de l'image finale, pour les captures ; `cible` : tampon où la scène est dessinée (préparation des salles) */
export const rendu = {
  image: null as null | (() => void),
  /** Après un changement de résolution (captures en double résolution) */
  redimensionner: null as null | (() => void),
  cible: null as THREE.WebGLRenderTarget | null,
  /** Captures en cours : sans grain */
  capture: false,
}

/** Réglages « photo » d'une salle */
export interface ReglagesEffets {
  /** Courbe de couleurs : AgX (photo) ou ACES (la courbe d'avant les effets) */
  courbe: 'agx' | 'aces'
  /** Halo autour des lumières vives : force, et luminosité à partir de laquelle il apparaît */
  halo: number
  seuilHalo: number
  grain: number
}

export const EFFETS_DEFAUT: ReglagesEffets = {
  courbe: 'agx',
  halo: 0.35,
  seuilHalo: 1,
  grain: 0.04,
}

const parSalle = new Map<string, ReglagesEffets>()
/** Les réglages d'effets d'une salle (un seul objet par salle : la touche M le modifie) */
export function reglagesEffets(salle: SalleConfig): ReglagesEffets {
  let r = parSalle.get(salle.id)
  // Valeurs de la config, puis celles enregistrées à la touche M (src/salles/reglages.json)
  if (!r) parSalle.set(salle.id, (r = { ...EFFETS_DEFAUT, ...salle.effets, ...(valeursEnregistrees(salle, 'Effets') as Partial<ReglagesEffets>) }))
  return r
}

/** Réglages d'effets de la salle affichée (touche M, « Effets · <salle> ») */
export function ReglagesEffetsSalle({ config }: { config: SalleConfig }) {
  const r = reglagesEffets(config)
  const reglages = useControls(dossierSalle('Effets', config), {
    ...boutonCopier(dossierSalle('Effets', config)),
    courbe: { value: r.courbe, options: { 'AgX (photo)': 'agx', 'ACES (avant)': 'aces' }, label: 'courbe de couleurs' },
    halo: { value: r.halo, min: 0, max: 2, step: 0.01, label: 'halo des lumières' },
    seuilHalo: { value: r.seuilHalo, min: 0.2, max: 4, step: 0.05, label: 'seuil du halo' },
    grain: { value: r.grain, min: 0, max: 0.3, step: 0.005, label: 'grain' },
  })
  Object.assign(r, reglages)
  return null
}

const melange = (a: number, b: number, w: number) => a + (b - a) * w

/**
 * Courbe de couleurs : ACES et AgX de three (exposition comprise), mélangées par `agx` (0 → 1). Pendant
 * un passage entre deux salles qui n'ont pas la même courbe, l'image glisse de l'une à l'autre (une
 * bascule d'un coup se voyait sur les œuvres, 31/10) ; hors passage, une seule des deux est calculée.
 */
class Courbe extends Effect {
  constructor() {
    super(
      'Courbe',
      /* glsl */ `
      #include <tonemapping_pars_fragment>
      uniform float agx;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        vec3 sortie = agx <= 0.0 ? ACESFilmicToneMapping(c)
          : agx >= 1.0 ? AgXToneMapping(c)
          : mix(ACESFilmicToneMapping(c), AgXToneMapping(c), agx);
        outputColor = vec4(sortie, inputColor.a);
      }`,
      { blendFunction: BlendFunction.SRC, uniforms: new Map([['agx', new THREE.Uniform(1)]]) },
    )
  }
}

/**
 * Profondeur de champ de la vue où l'on est (0 → 1, en fondu), et les réglages de la dernière vue
 * qui en avait, gardés le temps du fondu de sortie
 */
const flouVue = { valeur: 0, reglage: FLOU_DEFAUT }
/** Mise au point : le point regardé, ou à la distance réglée pour la vue */
const pointNet = new THREE.Vector3()
const direction = new THREE.Vector3()

export function Effets() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)

  const e = useControls('Effets (toutes les salles)', {
    ...boutonCopier('Effets (toutes les salles)'),
    actifs: { value: true, label: 'effets actifs' },
    smaa: { value: true, label: 'anticrénelage SMAA' },
  })

  const outils = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
    const dof = new DepthOfFieldEffect(camera, { focusDistance: 5, focusRange: 5, bokehScale: 3, resolutionScale: 0.5 })
    dof.target = pointNet
    // Deux jeux de halo et de courbe : un pour la passe avec profondeur de champ, un pour celle sans
    // (on passe de l'une à l'autre selon la distance, sans recompiler)
    const halo = () => new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1, luminanceSmoothing: 0.3, intensity: 0.35, radius: 0.7, levels: 6, resolutionScale: 0.5 })
    const bloom = [halo(), halo()]
    const courbe = [new Courbe(), new Courbe()]
    // Anticrénelage et grain : un jeu par passe (de loin, ils rejoignent la passe du halo et de la courbe)
    const smaa = [new SMAAEffect({ preset: SMAAPreset.LOW }), new SMAAEffect({ preset: SMAAPreset.LOW })]
    const nouveauGrain = () => new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
    const grain = [nouveauGrain(), nouveauGrain()]
    const passes = { avecFlou: [] as EffectPass[], sansFlou: [] as EffectPass[] }
    return { composer, dof, bloom, courbe, smaa, grain, passes, rendu: new RenderPass(scene, camera) }
  }, [gl, scene, camera])

  // Passes, refaites quand on active ou coupe l'anticrénelage. Chaque passe relit et réécrit toute
  // l'image : c'est ce qui coûte le plus en grand écran. De près (profondeur de champ), deux passes,
  // car on ne peut mettre qu'un effet de flou par passe (profondeur de champ, anticrénelage) ; de loin,
  // une seule (mesuré le 31/10 : une passe de moins rend environ 3 images/s sur un M1).
  // Les deux jeux sont là, un seul actif à la fois (on passe de l'un à l'autre sans recompiler).
  useEffect(() => {
    const { composer, dof, bloom, courbe, smaa, grain, passes } = outils
    const aa = (i: number) => (e.smaa ? [smaa[i]] : [])
    composer.removeAllPasses()
    composer.addPass(outils.rendu)
    passes.avecFlou = [new EffectPass(camera, dof, bloom[0], courbe[0]), new EffectPass(camera, ...aa(0), grain[0])]
    passes.sansFlou = [new EffectPass(camera, bloom[1], courbe[1], ...aa(1), grain[1])]
    for (const p of [...passes.avecFlou, ...passes.sansFlou]) composer.addPass(p)
    // Le composeur n'envoie à l'écran que la dernière passe : ici, la dernière de chaque jeu
    passes.avecFlou[1].renderToScreen = true
  }, [outils, camera, e.smaa])

  // La courbe de couleurs passe dans les effets : la scène est dessinée sans (sinon, deux fois)
  useEffect(() => {
    const avant = gl.toneMapping
    gl.toneMapping = e.actifs ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    return () => {
      gl.toneMapping = avant
    }
  }, [gl, e.actifs])

  // Taille des tampons : celle du canvas, à la résolution en cours (résolution adaptative)
  useEffect(() => {
    outils.composer.setSize(size.width, size.height, false)
  }, [outils, size.width, size.height, dpr])

  useEffect(() => {
    rendu.image = e.actifs ? () => outils.composer.render(0) : null
    rendu.redimensionner = () => outils.composer.setSize(size.width, size.height, false)
    rendu.cible = e.actifs ? outils.composer.inputBuffer : null
    return () => {
      rendu.image = rendu.redimensionner = null
      rendu.cible = null
    }
  }, [outils, e.actifs, size.width, size.height])

  useEffect(() => () => outils.composer.dispose(), [outils])
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__effets = outils
  }, [outils])

  useFrame((_, delta) => {
    // Réglages de la salle où l'on est ; pendant un passage, mélangés avec ceux de la salle d'arrivée
    const ca = configActuelle()
    const cb = configArriveeLue()
    const ra = ca ? reglagesEffets(ca) : EFFETS_DEFAUT
    const rb = cb ? reglagesEffets(cb) : ra
    const w = cb ? poidsArrivee(camera) : 0
    const agx = melange(ra.courbe === 'agx' ? 1 : 0, rb.courbe === 'agx' ? 1 : 0, w)
    uSortie.uLineaire.value = e.actifs ? 1 : 0
    // Exposition appliquée par la courbe (three : ACES la divise par 0,6)
    uSortie.uExpoSortie.value = gl.toneMappingExposure * melange(1 / 0.6, 1, agx)
    if (!e.actifs) return void gl.render(scene, camera)
    const { dof, bloom, courbe: courbes, grain, passes } = outils
    for (const b of bloom) {
      b.intensity = melange(ra.halo, rb.halo, w)
      b.luminanceMaterial.threshold = melange(ra.seuilHalo, rb.seuilHalo, w)
    }
    for (const c of courbes) c.uniforms.get('agx')!.value = agx
    // Profondeur de champ : seulement à une vue où elle est activée (popup ouvert, vue d'arrivée)
    const nom = vueEnCours.nom
    const reglage = ca && nom ? flouDeLaVue(ca, nom) : null
    if (reglage?.actif) flouVue.reglage = reglage
    const voulu = reglage?.actif ? 1 : 0
    flouVue.valeur = rendu.capture ? voulu : flouVue.valeur + (voulu - flouVue.valeur) * (1 - Math.exp(-3 * delta))
    const force = flouVue.valeur < 0.01 ? 0 : flouVue.valeur
    const f = flouVue.reglage
    if (f.miseAuPoint > 0) pointNet.copy(camera.position).addScaledVector(camera.getWorldDirection(direction), f.miseAuPoint)
    else pointNet.copy(regard)
    dof.cocMaterial.focusRange = f.nettete
    dof.bokehScale = f.flou * force
    for (const p of passes.avecFlou) p.enabled = force > 0
    for (const p of passes.sansFlou) p.enabled = force <= 0
    for (const g of grain) g.blendMode.opacity.value = rendu.capture ? 0 : melange(ra.grain, rb.grain, w)
    outils.composer.render(delta)
  }, 1) // après tout le reste (navigation, reflet), à la place du rendu automatique

  return null
}
