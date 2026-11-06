import * as THREE from 'three'
import { avancer, prevoir } from './chargement'

/**
 * Test invisible des performances de la machine (06/11, demande de Ludovic : ne jamais descendre
 * sous 30 images par seconde dans la salle de « La Chorée de Huntington », la plus lourde).
 *
 * Pendant l'écran d'accueil, dans le moteur de rendu des salles (déjà créé là, scene/moteurSalles.ts),
 * on dessine hors de l'écran une image d'un million de pixels avec un calcul proche de celui des
 * salles (bruit de la pierre lu dans une texture 3D, lumière, courbe de couleurs), plusieurs fois, et
 * on chronomètre la carte graphique. Rapporté au même test sur le Mac M1 de référence, cela donne le
 * coût d'une image de la salle Huntington à n'importe quelle résolution, d'où le départ des salles
 * (`departMachine`) : tout à pleine résolution si possible, sinon les premiers renoncements de
 * l'échelle de Ludovic (renoncements.ts), puis une résolution plus basse. Le test n'est qu'une
 * estimation (les cartes graphiques ne se ressemblent pas toutes) : les arbitrages en direct
 * (resolution.ts) corrigent ensuite, dans un sens comme dans l'autre.
 */

/**
 * Salle Huntington sur le M1 de référence (mesuré le 06/11 avec les effets d'image, SMAA basse, ×1 ; voir `charge` pour ×2 et plus) :
 * temps fixe (ombres…) et temps par million de pixels dessinés, à la vue d'arrivée
 */
const HUNTINGTON_FIXE = 1.5
const HUNTINGTON_PAR_MPX = 2.7
/** Pire point de vue de la salle par rapport à la vue d'arrivée (étape Maladie : +10 %) */
const PIRE_VUE = 1.12
/**
 * Suréchantillonnage de la scène (Effets.tsx, touche M « Effets (toutes les salles) », ×4 par défaut
 * depuis le 06/11, réglages de Ludovic) : chaque échantillon en plus ajoute PART_SCENE du coût par
 * pixel à ×1 (la scène seule est dessinée plus grande, les effets restent à la taille de l'image ;
 * d'après les mesures du 05/11 sur le M1 : 30 → 22 / 16 / 10 images/s à ×1 / ×2 / ×4 / ×6)
 */
export const ECHANTILLONS_DEFAUT = 4
export const charge = { echantillons: ECHANTILLONS_DEFAUT }
const PART_SCENE = 0.4
/** Coût par pixel de `e` échantillons, par rapport à ×1 */
export const coutEchantillons = (e = charge.echantillons) => 1 + PART_SCENE * (Math.max(1, e) - 1)
/** Résultat du test sur ce même M1, pendant l'écran d'accueil (ms par passe d'un million de pixels ; 0,114 à 0,124 sur cinq chargements) */
const TEST_M1 = 0.12

/**
 * Images par seconde visées au départ, au pire point de vue (mêmes seuils que les arbitrages en
 * direct, resolution.ts) : 30 avant de renoncer à l'anticrénelage, 24 avant de baisser la résolution
 */
const BUDGET_RENONCER = 1000 / 30
const BUDGET_RESOLUTION = 1000 / 24
/** Résolution la plus basse, même sur une machine très lente */
export const RESOLUTION_MIN = 0.25

export const machine = {
  /** Lenteur de la carte graphique par rapport au M1 (2 = deux fois plus lente) ; null tant que le test n'a pas eu lieu */
  facteur: null as number | null,
  /** Mesure brute (ms par passe d'un million de pixels) */
  mesure: null as number | null,
  /** Carte graphique (pour la mise au point) */
  carte: '',
}

/** Résolution maximale de l'écran (plafonnée à 2, comme resolution.ts) */
const maxEcran = () => Math.min(window.devicePixelRatio || 1, 2)

/** Coût estimé d'une image de la salle Huntington (ms) à cette résolution, au pire point de vue */
export function coutEstime(ratio: number, e = charge.echantillons, largeur = window.innerWidth, hauteur = window.innerHeight) {
  const f = machine.facteur ?? 1
  const mpx = (largeur * hauteur * ratio * ratio) / 1e6
  return f * (HUNTINGTON_FIXE + HUNTINGTON_PAR_MPX * coutEchantillons(e) * mpx) * PIRE_VUE
}

/**
 * Départ conseillé par le test dans les salles (06/11, échelle des renoncements de Ludovic,
 * renoncements.ts) : tout à pleine résolution si le coût estimé le permet ; sinon, effets coupés et
 * anticrénelage ×2, puis ×1 ; sinon, résolution baissée (par pas de 0,05). Le coût des effets
 * (profondeur de champ, reflets, halos, poussière) n'est pas estimé : on ne part pas sans eux tant
 * que l'anticrénelage tient. Les arbitrages en direct corrigent ensuite (resolution.ts).
 */
export function departMachine(): { niveau: number; ratio: number } {
  const max = maxEcran()
  if (machine.facteur === null) return { niveau: 0, ratio: max }
  const voulu = charge.echantillons
  if (coutEstime(max, voulu) <= BUDGET_RENONCER) return { niveau: 0, ratio: max }
  if (voulu > 2 && coutEstime(max, 2) <= BUDGET_RENONCER) return { niveau: 5, ratio: max }
  if (coutEstime(max, 1) <= BUDGET_RESOLUTION) return { niveau: 6, ratio: max }
  const f = machine.facteur
  const mpx = (window.innerWidth * window.innerHeight) / 1e6
  const r = Math.sqrt(Math.max(0, BUDGET_RESOLUTION / (f * PIRE_VUE) - HUNTINGTON_FIXE) / (HUNTINGTON_PAR_MPX * mpx))
  return { niveau: 6, ratio: Math.min(max, Math.max(RESOLUTION_MIN, Math.floor(r * 20) / 20)) }
}

/** Taille de l'image du test (1 million de pixels) */
const TAILLE = 1024
/** Chauffe de la carte graphique avant la mesure (ms) */
const CHAUFFE = 60
/** Séries mesurées, et durée visée de chacune (ms) */
const SERIES = 5
const VISE_PAR_SERIE = 8

const SOMMETS = /* glsl */ `
out vec2 vUv;
void main() {
  // Triangle qui couvre tout l'écran
  vUv = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(vUv * 2.0 - 1.0, 0.0, 1.0);
}`

const FRAGMENTS = /* glsl */ `
precision highp float;
precision highp sampler3D;
uniform sampler3D uBruit;
uniform float uT;
in vec2 vUv;
out vec4 sortie;
void main() {
  // Bruit en couches, lu dans une texture 3D (comme la pierre des salles)
  vec3 p = vec3(vUv * 6.0, uT);
  float n = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    n += a * texture(uBruit, p).r;
    p = p * 2.03 + vec3(0.17, 0.31, 0.07);
    a *= 0.5;
  }
  // Lumière : relief, reflet, brouillard
  vec3 normale = normalize(vec3(dFdx(n), dFdy(n), 0.02));
  float diffus = max(dot(normale, normalize(vec3(0.3, 0.8, 0.5))), 0.0);
  float brillant = pow(max(dot(reflect(-normalize(vec3(0.1, 0.2, 1.0)), normale), vec3(0.0, 0.0, 1.0)), 0.0), 16.0);
  vec3 c = vec3(0.6, 0.55, 0.5) * n * (0.2 + diffus) + brillant * exp(-vUv.y * 2.0);
  // Courbe de couleurs
  c = c / (1.0 + c);
  sortie = vec4(pow(c, vec3(1.0 / 2.2)) * 0.01, 1.0);
}`

/** Lance le test (une fois) ; l'écran d'accueil l'attend (chargement.ts) */
export function testerMachine(moteur: THREE.WebGLRenderer) {
  if (machine.facteur !== null || testEnCours) return testEnCours
  prevoir('machine')
  testEnCours = mesurer(moteur)
    .catch(() => null)
    .then((mesure) => {
      if (mesure && isFinite(mesure) && mesure > 0) {
        machine.mesure = mesure
        machine.facteur = mesure / TEST_M1
        // Mise au point : simuler une machine plus lente (?lenteur=4 dans l'adresse, en dev seulement)
        const lenteur = import.meta.env.DEV && Number(new URLSearchParams(window.location.search).get('lenteur'))
        if (lenteur) machine.facteur *= lenteur
      }
      avancer('machine', 1)
      if (import.meta.env.DEV) {
        ;(window as unknown as Record<string, unknown>).__machine = { ...machine, depart: departMachine(), coutEstime }
        console.info('[machine]', machine, 'départ', departMachine())
      }
    })
  return testEnCours
}
let testEnCours: Promise<void> | null = null

async function mesurer(moteur: THREE.WebGLRenderer): Promise<number | null> {
  const gl = moteur.getContext()
  if (!(gl instanceof WebGL2RenderingContext)) return null
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  machine.carte = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : ''

  // Bruit 32³ (comme textureBruit de scene/pierre.ts, recopié pour ne pas charger la 3D des salles ici)
  const n = 32
  const valeurs = new Uint8Array(n * n * n)
  let g = 12345
  for (let i = 0; i < valeurs.length; i++) {
    g = (g * 1103515245 + 12345) & 0x7fffffff
    valeurs[i] = g >> 23
  }
  const bruit = new THREE.Data3DTexture(valeurs, n, n, n)
  bruit.format = THREE.RedFormat
  bruit.minFilter = bruit.magFilter = THREE.LinearFilter
  bruit.wrapS = bruit.wrapT = bruit.wrapR = THREE.RepeatWrapping
  bruit.needsUpdate = true

  const matiere = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: SOMMETS,
    fragmentShader: FRAGMENTS,
    uniforms: { uBruit: { value: bruit }, uT: { value: 0 } },
    depthTest: false,
    depthWrite: false,
    // Passes ajoutées l'une à l'autre : opaques, les cartes graphiques à tuiles (Apple, téléphones)
    // ne calculaient que la dernière (0,05 ms au lieu de plusieurs)
    transparent: true,
    blending: THREE.AdditiveBlending,
  })
  const geometrie = new THREE.BufferGeometry()
  geometrie.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3))
  const triangle = new THREE.Mesh(geometrie, matiere)
  triangle.frustumCulled = false
  const scene = new THREE.Scene()
  scene.add(triangle)
  const camera = new THREE.Camera()
  const cible = new THREE.WebGLRenderTarget(TAILLE, TAILLE, { depthBuffer: false })
  const pixel = new Uint8Array(4)

  const attendre = () => moteur.readRenderTargetPixels(cible, 0, 0, 1, 1, pixel)
  const passes = (k: number) => {
    for (let i = 0; i < k; i++) {
      matiere.uniforms.uT.value = Math.random()
      moteur.render(scene, camera)
    }
  }
  /** Temps de k passes (ms), en attendant la fin de tout travail en cours avant et après */
  const chronometrer = (k: number) => {
    attendre()
    const t0 = performance.now()
    passes(k)
    attendre()
    return performance.now() - t0
  }

  // Une image du test : le moteur est rendu tel quel après chacune (une salle peut le prendre entre deux, arrivée directe)
  const image = async <T,>(travail: () => T) => {
    await new Promise(requestAnimationFrame)
    const cibleAvant = moteur.getRenderTarget()
    const effacerAvant = moteur.autoClear
    moteur.setRenderTarget(cible)
    moteur.autoClear = false
    try {
      return travail()
    } finally {
      moteur.setRenderTarget(cibleAvant)
      moteur.autoClear = effacerAvant
    }
  }

  const mesures: number[] = []
  try {
    // Compilation, à part
    await image(() => chronometrer(1))
    // Mesure d'un bloc (≈ 0,1 s figée sur le M1, pendant l'écran d'accueil). Étalée sur plusieurs
    // images, la carte graphique ne montait pas en régime (mesures de 0,5 à 4 au lieu de 0,12, 06/11) ;
    // par différence entre deux séries, l'attente de leur fin rendait la mesure inutilisable
    await image(() => {
      // Chauffe : au repos, la carte graphique tourne au ralenti (sur le M1, jusqu'à trois fois plus
      // lente) ; elle accélère sous un travail continu, comme dans une salle. Séries de plus en plus
      // longues : l'attente de la fin d'une série (2 à 8 ms ici) finit par moins compter
      const debut = performance.now()
      let parPasse = 1
      for (let n = 1; performance.now() - debut < CHAUFFE && n <= 1024; n *= 2) parPasse = chronometrer(n) / n
      // Mesure : quelques séries d'environ VISE_PAR_SERIE chacune
      const k = Math.max(1, Math.min(1000, Math.round(VISE_PAR_SERIE / Math.max(parPasse, 0.005))))
      for (let i = 0; i < SERIES; i++) mesures.push(chronometrer(k) / k)
      if (import.meta.env.DEV) Object.assign(machine, { detail: { parPasse, k, series: mesures.map((m) => +(m * k).toFixed(2)) } })
    })
  } finally {
    cible.dispose()
    matiere.dispose()
    geometrie.dispose()
    bruit.dispose()
  }
  // La série la plus rapide : le travail des autres (chargement de la salle, autres logiciels qui
  // dessinent) ne peut que ralentir une série, jamais l'accélérer
  return Math.min(...mesures) * (1e6 / (TAILLE * TAILLE))
}
