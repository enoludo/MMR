import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useControls } from 'leva'
import * as THREE from 'three'
import type { SalleConfig } from '../salles/types'
import { boutonCopier, dossierSalle, reglagesSalle, useReglagesSalle, valeursEnregistrees } from '../reglages'
import { charge, ECHANTILLONS_DEFAUT } from '../performances'
import { echantillonsMax, sansFlou, sansHalos } from '../renoncements'
import { configActuelle, configArriveeLue, poidsArrivee, salleActuelle, salleArrivee } from './passage'
import { FLOU_SALLE_DEFAUT, PasseFlouSalle, distanceAxe, rayonFlou } from './FlouSalle'
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
 * Touche M, dossier « Effets (toutes les salles) » : effets actifs, anticrénelage (qualité du SMAA et
 * suréchantillonnage ×2, ×4, ×6, 05/11 : `PasseScene`). Les captures (outils/capture.ts) et la photo du retour vers la
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
  /** Compile sans bloquer les matières des effets d'image (préparation des salles, Experience) */
  compiler: null as null | (() => Promise<void>),
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
  useReglagesSalle(config, 'Flou de la salle', schemaFlouSalle(config))
  return null
}

/** Flou de la salle (FlouSalle.ts) : touche M, « Flou de la salle · <salle> » ; valeurs de départ dans la config */
function schemaFlouSalle(salle: SalleConfig) {
  const d = { ...FLOU_SALLE_DEFAUT, ...salle.flouSalle }
  return {
    actif: { value: d.actif, label: 'flou actif' },
    flouPres: { value: d.flouPres, min: 0, max: 60, step: 0.5, label: 'flou de près (px)' },
    pres: { value: d.pres, min: 0, max: 20, step: 0.1, label: 'de près : à (m)' },
    flouLoin: { value: d.flouLoin, min: 0, max: 60, step: 0.5, label: 'flou de loin (px)' },
    loin: { value: d.loin, min: 0.5, max: 30, step: 0.1, label: 'de loin : à (m)' },
    debut: { value: d.debut, min: 0, max: 20, step: 0.1, label: 'nette jusqu’à (m)' },
    progression: { value: d.progression, min: 0.5, max: 40, step: 0.5, label: 'progression (m)' },
    haut: { value: d.haut, min: 0, max: 12, step: 0.05, label: 'haut de l’œuvre (m)' },
  }
}
const reglagesFlouSalle = (salle: SalleConfig) => reglagesSalle(salle, 'Flou de la salle', schemaFlouSalle(salle))
/** Flou de la salle en fondu (0 → 1), comme la profondeur de champ */
const flouSalle = { valeur: 0 }
const piedOeuvre = new THREE.Vector3()

/**
 * Suréchantillonnage (05/11, demande de Ludovic : plus de marge pour l'anticrénelage) : la scène est
 * dessinée 2, 4 ou 6 fois plus de pixels (√2, 2 ou √6 fois plus large et plus haute), puis réduite à la
 * taille de l'image avant les effets. La réduction moyenne les échantillons de chaque pixel en donnant
 * moins de poids aux plus lumineux (moyenne de Karis) : l'image est encore en lumière brute, avant la
 * courbe de couleurs, et une simple moyenne laissait les bords clairs sur fond sombre en escalier.
 * C'est aussi pour cela que le multi-échantillonnage de la carte graphique (MSAA), essayé d'abord, ne
 * servait à rien ici (et il s'arrête à ×4 sur un Mac M1). Le coût suit le nombre d'échantillons (scène
 * seulement : les effets restent à la taille de l'image). Profondeur recopiée (profondeur de champ).
 * Le reflet du sol est lu au pixel : il suit `surEchantillonnage.echelle`. La poussière (`dessinsDirects`) est
 * dessinée après la réduction, à la taille de l'image : ses grains, souvent plus petits qu'un pixel,
 * perdaient leur éclat dans la moyenne.
 */
export const surEchantillonnage = { echelle: 1 }
/** Objets dessinés à la taille de l'image, après la réduction (profondeur de la scène réduite) */
export const dessinsDirects = new Set<THREE.Object3D>()

/** Au plus 40 millions d'échantillons (captures en 5120 × 2880 : ×6 demanderait plus d'un Go) */
const ECHANTILLONS_MAX = 40e6

/** Visible avec tous ses parents (une salle cachée garde sa poussière visible) */
function estVisible(o: THREE.Object3D | null): boolean {
  for (; o; o = o.parent) if (!o.visible) return false
  return true
}

class PasseScene extends RenderPass {
  echantillons = 1
  private grand: THREE.WebGLRenderTarget | null = null
  private reduction = new THREE.ShaderMaterial({
    uniforms: {
      tCouleur: { value: null },
      tProfondeur: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uEchelle: { value: 1 },
      uExposition: { value: 1 },
      uPrises: { value: 2 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D tCouleur;
      uniform sampler2D tProfondeur;
      uniform vec2 uTexel;
      uniform float uEchelle;
      uniform float uExposition;
      uniform int uPrises;
      varying vec2 vUv;
      void main() {
        // prises réparties sur la surface du pixel (2 × 2 ou 3 × 3), lues avec le filtre linéaire
        vec4 somme = vec4(0.0);
        float poids = 0.0;
        for (int i = 0; i < 3; i++) for (int j = 0; j < 3; j++) {
          if (i >= uPrises || j >= uPrises) continue;
          vec2 o = (vec2(float(i), float(j)) + 0.5) / float(uPrises) - 0.5;
          vec4 c = texture2D(tCouleur, vUv + o * uEchelle * uTexel);
          float w = 1.0 / (1.0 + max(c.r, max(c.g, c.b)) * uExposition);
          somme += c * w;
          poids += w;
        }
        gl_FragColor = somme / poids;
        gl_FragDepth = texture2D(tProfondeur, vUv).r;
      }`,
    depthTest: true,
    depthWrite: true,
    depthFunc: THREE.AlwaysDepth,
  })
  private ecran = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.reduction)
  private camOrtho = new THREE.OrthographicCamera()

  constructor(scene: THREE.Scene, camera: THREE.Camera) {
    super(scene, camera)
    this.ecran.frustumCulled = false
  }

  render(renderer: THREE.WebGLRenderer, inputBuffer: THREE.WebGLRenderTarget, outputBuffer: THREE.WebGLRenderTarget, delta?: number, stencil?: boolean) {
    const { width: w, height: h } = inputBuffer
    const max = renderer.capabilities.maxTextureSize
    const s = Math.min(Math.sqrt(this.echantillons), Math.sqrt(ECHANTILLONS_MAX / (w * h)), max / w, max / h)
    if (s <= 1.01 || this.renderToScreen) {
      surEchantillonnage.echelle = 1
      if (this.grand) this.grand = (this.grand.dispose(), null)
      return super.render(renderer, inputBuffer, outputBuffer, delta, stencil)
    }
    const gw = Math.round(w * s)
    const gh = Math.round(h * s)
    if (!this.grand) {
      this.grand = new THREE.WebGLRenderTarget(gw, gh, {
        type: THREE.HalfFloatType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        depthTexture: new THREE.DepthTexture(gw, gh, THREE.FloatType),
      })
      this.grand.texture.generateMipmaps = false
    } else if (this.grand.width !== gw || this.grand.height !== gh) this.grand.setSize(gw, gh)
    surEchantillonnage.echelle = gw / w
    for (const o of dessinsDirects) o.visible = false
    super.render(renderer, this.grand, outputBuffer, delta, stencil)
    for (const o of dessinsDirects) o.visible = true
    const u = this.reduction.uniforms
    u.tCouleur.value = this.grand.texture
    u.tProfondeur.value = this.grand.depthTexture
    u.uTexel.value.set(1 / gw, 1 / gh)
    u.uEchelle.value = gw / w
    u.uExposition.value = renderer.toneMappingExposure
    u.uPrises.value = this.echantillons > 4 ? 3 : 2
    renderer.setRenderTarget(inputBuffer)
    renderer.render(this.ecran, this.camOrtho)
    // Poussière : par-dessus, testée contre la profondeur réduite (sans fond ni ombres recalculés)
    const ombres = renderer.shadowMap.autoUpdate
    renderer.shadowMap.autoUpdate = false
    for (const o of dessinsDirects) if (estVisible(o)) renderer.render(o, this.camera!)
    renderer.shadowMap.autoUpdate = ombres
  }

  dispose() {
    this.grand?.dispose()
    this.reduction.dispose()
    this.ecran.geometry.dispose()
    super.dispose()
  }
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
    smaa: {
      value: SMAAPreset.LOW as number,
      options: { aucun: -1, basse: SMAAPreset.LOW, moyenne: SMAAPreset.MEDIUM, haute: SMAAPreset.HIGH, ultra: SMAAPreset.ULTRA },
      label: 'SMAA',
    },
    echantillons: { value: ECHANTILLONS_DEFAUT, options: { '×1': 1, '×2': 2, '×4': 4, '×6': 6 }, label: 'échantillons' },
  })
  const avecSmaa = e.smaa >= 0

  const outils = useMemo(() => {
    const composer = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: 0 })
    const dof = new DepthOfFieldEffect(camera, { focusDistance: 5, focusRange: 5, bokehScale: 3, resolutionScale: 0.5 })
    dof.target = pointNet
    // Deux jeux de halo et de courbe : un pour la passe avec profondeur de champ, un pour celle sans
    // (on passe de l'une à l'autre selon la distance, sans recompiler)
    const halo = () => new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1, luminanceSmoothing: 0.3, intensity: 0.35, radius: 0.7, levels: 6, resolutionScale: 0.5 })
    const bloom = [halo(), halo()]
    // Quatre jeux : avec profondeur de champ, sans, sans halo (renoncements.ts), et la courbe seule (effets coupés,
    // flou de la salle gardé)
    const courbe = [new Courbe(), new Courbe(), new Courbe(), new Courbe()]
    // Anticrénelage et grain : un jeu par passe (de loin, ils rejoignent la passe du halo et de la courbe)
    const smaa = [0, 1, 2].map(() => new SMAAEffect({ preset: SMAAPreset.LOW }))
    const nouveauGrain = () => new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false })
    const grain = [nouveauGrain(), nouveauGrain(), nouveauGrain()]
    const passes = { avecFlou: [] as EffectPass[], sansFlou: [] as EffectPass[], sansHalo: [] as EffectPass[], brut: [] as EffectPass[] }
    return { composer, dof, bloom, courbe, smaa, grain, passes, rendu: new PasseScene(scene, camera), flouSalle: new PasseFlouSalle(scene, camera) }
  }, [gl, scene, camera])

  // Passes, refaites quand on active ou coupe l'anticrénelage. Chaque passe relit et réécrit toute
  // l'image : c'est ce qui coûte le plus en grand écran. De près (profondeur de champ), deux passes,
  // car on ne peut mettre qu'un effet de flou par passe (profondeur de champ, anticrénelage) ; de loin,
  // une seule (mesuré le 31/10 : une passe de moins rend environ 3 images/s sur un M1).
  // Les deux jeux sont là, un seul actif à la fois (on passe de l'un à l'autre sans recompiler).
  useEffect(() => {
    const { composer, dof, bloom, courbe, smaa, grain, passes } = outils
    const aa = (i: number) => (avecSmaa ? [smaa[i]] : [])
    composer.removeAllPasses()
    composer.addPass(outils.rendu)
    composer.addPass(outils.flouSalle)
    passes.avecFlou = [new EffectPass(camera, dof, bloom[0], courbe[0]), new EffectPass(camera, ...aa(0), grain[0])]
    passes.sansFlou = [new EffectPass(camera, bloom[1], courbe[1], ...aa(1), grain[1])]
    passes.sansHalo = [new EffectPass(camera, courbe[2], ...aa(2), grain[2])]
    passes.brut = [new EffectPass(camera, courbe[3])]
    for (const p of [...passes.avecFlou, ...passes.sansFlou, ...passes.sansHalo, ...passes.brut]) composer.addPass(p)
    // Le composeur n'envoie à l'écran que la dernière passe : ici, la dernière de chaque jeu
    passes.avecFlou[1].renderToScreen = true
    passes.sansFlou[0].renderToScreen = true
    passes.sansHalo[0].renderToScreen = true
  }, [outils, camera, avecSmaa])

  // Qualité du SMAA (basse jusqu'au 05/11) : plus haute, il suit mieux les bords fins et en biais
  useEffect(() => {
    if (avecSmaa) for (const a of outils.smaa) a.applyPreset(e.smaa as SMAAPreset)
  }, [outils, avecSmaa, e.smaa])

  // Suréchantillonnage (05/11) : 1, 2, 4 ou 6 échantillons par pixel, réduit par les renoncements
  // (renoncements.ts, appliqué à chaque image) ; le test de la machine part du réglage voulu (performances.ts)
  useEffect(() => {
    charge.echantillons = e.actifs ? e.echantillons : 1
  }, [e.actifs, e.echantillons])

  // La courbe de couleurs passe dans les effets : la scène est dessinée sans (sinon, deux fois) ; réglée à chaque
  // image (le flou de la salle passe par les effets même quand ils sont coupés), remise en partant
  useEffect(() => {
    const avant = gl.toneMapping
    return () => {
      gl.toneMapping = avant
    }
  }, [gl])

  // Taille des tampons : celle du canvas, à la résolution en cours (résolution adaptative)
  useEffect(() => {
    outils.composer.setSize(size.width, size.height, false)
  }, [outils, size.width, size.height, dpr])

  useEffect(() => {
    rendu.image = e.actifs ? () => outils.composer.render(0) : null
    rendu.redimensionner = () => outils.composer.setSize(size.width, size.height, false)
    rendu.cible = e.actifs ? outils.composer.inputBuffer : null
    // L'anticrénelage (SMAA) a ses propres matières, compilées au premier dessin des effets, d'un
    // bloc (≈ 0,1 s figées pendant le rangement de la grille, mesuré le 04/11) : on les compile
    // d'avance, dans une image, comme elles seront dessinées
    rendu.compiler = e.actifs
      ? () => {
          const temp = new THREE.Scene()
          const forme = new THREE.PlaneGeometry(2, 2)
          for (const m of outils.smaa.flatMap((a) => [a.edgeDetectionMaterial, a.weightsMaterial])) {
            const maillage = new THREE.Mesh(forme, m)
            maillage.frustumCulled = false
            temp.add(maillage)
          }
          const avant = gl.getRenderTarget()
          gl.setRenderTarget(outils.composer.inputBuffer)
          const fait = gl.compileAsync(temp, camera)
          gl.setRenderTarget(avant)
          return fait.then(() => {}, () => {}).finally(() => forme.dispose())
        }
      : null
    return () => {
      rendu.image = rendu.redimensionner = rendu.compiler = null
      rendu.cible = null
    }
  }, [outils, e.actifs, size.width, size.height, gl, camera])

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
    const { dof, bloom, courbe: courbes, grain, passes } = outils
    // Flou de la salle (FlouSalle.ts) : l'œuvre de chaque salle suivie, et la force mélangée pendant un passage.
    // Indépendant de « effets actifs » (07/11, demande de Ludovic) : effets coupés, il passe seul, avec la courbe.
    const fa = ca ? reglagesFlouSalle(ca) : null
    const fb = cb ? reglagesFlouSalle(cb) : null
    const passeFlou = outils.flouSalle
    const rayons = [0, 0]
    ;([[ca, fa, salleActuelle()], [cb, fb, salleArrivee()]] as const).forEach(([c, f, groupe], i) => {
      const s = passeFlou.salles[i]
      s.presente = !!(c && f && groupe)
      if (!c || !f || !groupe) return
      groupe.updateMatrixWorld()
      s.pied.copy(groupe.localToWorld(piedOeuvre.set(c.sculpture.position[0], 0, c.sculpture.position[2])))
      s.haut = f.haut
      s.debut = f.debut
      s.progression = f.progression
      // Plus la caméra est près de l'œuvre, plus la salle est floue
      rayons[i] = rayonFlou(f, distanceAxe(camera.position, s.pied, f.haut))
    })
    const actifA = fa?.actif ? 1 : 0
    const actifB = cb ? (fb?.actif ? 1 : 0) : actifA
    // Jamais coupé par l'échelle des renoncements pour le moment (07/11, décision de Ludovic ; ≈ 10 % d'images/s sur le M1)
    const vouluSalle = melange(actifA, actifB, w)
    flouSalle.valeur = rendu.capture ? vouluSalle : flouSalle.valeur + (vouluSalle - flouSalle.valeur) * (1 - Math.exp(-3 * delta))
    passeFlou.force = flouSalle.valeur
    passeFlou.rayon = melange(fa?.actif ? rayons[0] : rayons[1], fb?.actif ? rayons[1] : rayons[0], w)
    passeFlou.enabled = flouSalle.valeur > 0.01

    // Effets coupés : rendu direct (courbe ACES de three), ou, avec le flou de la salle, scène, flou et courbe ACES
    const avecComposeur = e.actifs || passeFlou.enabled
    gl.toneMapping = avecComposeur ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping
    uSortie.uLineaire.value = avecComposeur ? 1 : 0
    const agxVu = e.actifs ? agx : 0
    // Exposition appliquée par la courbe (three : ACES la divise par 0,6)
    uSortie.uExpoSortie.value = gl.toneMappingExposure * melange(1 / 0.6, 1, agxVu)
    outils.rendu.echantillons = e.actifs ? Math.min(e.echantillons, echantillonsMax()) : 1
    if (!avecComposeur) return void gl.render(scene, camera)
    for (const c of courbes) c.uniforms.get('agx')!.value = agxVu
    if (!e.actifs) {
      for (const p of [...passes.avecFlou, ...passes.sansFlou, ...passes.sansHalo]) p.enabled = false
      for (const p of passes.brut) p.enabled = true
      return void outils.composer.render(delta)
    }
    for (const p of passes.brut) p.enabled = false
    for (const b of bloom) {
      b.intensity = melange(ra.halo, rb.halo, w)
      b.luminanceMaterial.threshold = melange(ra.seuilHalo, rb.seuilHalo, w)
    }
    // Profondeur de champ : seulement à une vue où elle est activée (popup ouvert, vue d'arrivée)
    const nom = vueEnCours.nom
    const reglage = ca && nom ? flouDeLaVue(ca, nom) : null
    if (reglage?.actif) flouVue.reglage = reglage
    const voulu = reglage?.actif && !sansFlou() ? 1 : 0
    flouVue.valeur = rendu.capture ? voulu : flouVue.valeur + (voulu - flouVue.valeur) * (1 - Math.exp(-3 * delta))
    const force = flouVue.valeur < 0.01 ? 0 : flouVue.valeur
    const f = flouVue.reglage
    if (f.miseAuPoint > 0) pointNet.copy(camera.position).addScaledVector(camera.getWorldDirection(direction), f.miseAuPoint)
    else pointNet.copy(regard)
    dof.cocMaterial.focusRange = f.nettete
    dof.bokehScale = f.flou * force
    for (const p of passes.avecFlou) p.enabled = force > 0
    for (const p of passes.sansFlou) p.enabled = force <= 0 && !sansHalos()
    for (const p of passes.sansHalo) p.enabled = force <= 0 && sansHalos()
    for (const g of grain) g.blendMode.opacity.value = rendu.capture ? 0 : melange(ra.grain, rb.grain, w)
    outils.composer.render(delta)
  }, 1) // après tout le reste (navigation, reflet), à la place du rendu automatique

  return null
}
