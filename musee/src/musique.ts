import { versionne } from './version'

/**
 * Musique des salles : une piste par œuvre (champ `musique` de l'œuvre), jouée en boucle.
 * Sons d'interface (clics) : `son()`, par le même gain général (coupés avec la musique).
 *
 * - Le son passe par Web Audio (un gain par piste et un gain général) : les fondus marchent
 *   partout, y compris sur iPhone où le volume d'un élément <audio> ne se règle pas.
 * - La boucle se fait en fondu enchaîné (deux lecteurs par piste, FONDU_BOUCLE secondes de
 *   recouvrement) : on n'entend pas la reprise, quel que soit le fichier.
 * - Les navigateurs interdisent le son avant une action du visiteur : la musique attend le
 *   premier clic, la première touche ou le premier toucher, puis monte en fondu.
 * - Son coupé (bouton du header) ou onglet caché : le gain général descend à 0.
 */

/** Volume de la musique (0 → 1) */
const VOLUME = 0.6
/** Recouvrement des deux lecteurs à la fin de chaque boucle (s) */
const FONDU_BOUCLE = 4
/** Fondu du son coupé ou remis, de l'onglet caché ou revenu (s) */
const FONDU_GENERAL = 0.8

let contexte: AudioContext | null = null
let general: GainNode | null = null
let muet = false
let cache = typeof document !== 'undefined' && document.hidden

/** Contexte audio, créé au premier besoin ; il reste suspendu jusqu'à une action du visiteur */
function audio() {
  if (!contexte) {
    contexte = new AudioContext()
    general = contexte.createGain()
    general.gain.value = muet || cache ? 0 : 1
    general.connect(contexte.destination)
    attendreGeste()
  }
  return { ctx: contexte, general: general! }
}

/** Amène un gain à `valeur` en `duree` secondes, depuis sa valeur du moment */
function fondre(gain: GainNode, valeur: number, duree: number) {
  const t = gain.context.currentTime
  gain.gain.cancelScheduledValues(t)
  gain.gain.setValueAtTime(gain.gain.value, t)
  gain.gain.linearRampToValueAtTime(valeur, t + Math.max(0.01, duree))
}

/** Au premier geste du visiteur : le contexte démarre et les pistes voulues se lancent */
function attendreGeste() {
  const debloquer = () => {
    if (!contexte) return
    contexte.resume()
    pistes.forEach((p) => p.reprendre())
    if (contexte.state === 'running') retirer()
  }
  const retirer = () => {
    window.removeEventListener('pointerdown', debloquer, true)
    window.removeEventListener('keydown', debloquer, true)
    window.removeEventListener('touchend', debloquer, true)
  }
  window.addEventListener('pointerdown', debloquer, true)
  window.addEventListener('keydown', debloquer, true)
  window.addEventListener('touchend', debloquer, true)
}

/** Une piste en boucle : deux lecteurs qui se relaient en fondu enchaîné */
class Piste {
  private lecteurs: { el: HTMLAudioElement; gain: GainNode }[]
  private actif = 0
  private gain: GainNode
  private minuteur = 0
  /** La piste doit jouer (elle s'arrête une fois son fondu de sortie fini) */
  private voulue = false

  constructor(readonly url: string) {
    const { ctx, general } = audio()
    this.gain = ctx.createGain()
    this.gain.gain.value = 0
    this.gain.connect(general)
    this.lecteurs = [0, 1].map(() => {
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.src = url
      const gain = ctx.createGain()
      gain.gain.value = 0
      ctx.createMediaElementSource(el).connect(gain).connect(this.gain)
      return { el, gain }
    })
    this.lecteurs[0].gain.gain.value = 1
  }

  jouer(fondu: number) {
    this.voulue = true
    clearTimeout(this.minuteur)
    this.reprendre()
    fondre(this.gain, VOLUME, fondu)
    // Relais des deux lecteurs avant la fin de la boucle
    if (!this.surveillance) this.surveillance = window.setInterval(() => this.relayer(), 250)
  }

  arreter(fondu: number) {
    this.voulue = false
    fondre(this.gain, 0, fondu)
    clearTimeout(this.minuteur)
    this.minuteur = window.setTimeout(() => {
      this.lecteurs.forEach((l) => l.el.pause())
      clearInterval(this.surveillance)
      this.surveillance = 0
    }, fondu * 1000 + 100)
  }

  /** La piste peut démarrer (assez de données téléchargées) */
  prete() {
    const el = this.lecteurs[0].el
    if (el.readyState >= 3) return Promise.resolve()
    return new Promise<void>((ok) => {
      el.addEventListener('canplay', () => ok(), { once: true })
      el.addEventListener('error', () => ok(), { once: true })
    })
  }

  /** Relance le lecteur actif (après un geste du visiteur, ou si le navigateur l'a mis en pause) */
  reprendre() {
    if (!this.voulue || contexte?.state !== 'running') return
    const l = this.lecteurs[this.actif]
    if (l.el.paused) l.el.play().catch(() => {})
  }

  private surveillance = 0
  private relayer() {
    const l = this.lecteurs[this.actif]
    const duree = l.el.duration
    if (!this.voulue || !isFinite(duree) || duree < FONDU_BOUCLE * 3 || l.el.paused) return
    if (duree - l.el.currentTime > FONDU_BOUCLE) return
    // Le second lecteur repart du début en montant, pendant que le premier finit en descendant
    const suivant = this.lecteurs[1 - this.actif]
    suivant.el.currentTime = 0
    suivant.el.play().catch(() => {})
    fondre(suivant.gain, 1, FONDU_BOUCLE)
    fondre(l.gain, 0, FONDU_BOUCLE)
    this.actif = 1 - this.actif
  }
}

const pistes = new Map<string, Piste>()
let voulue: string | null = null

/**
 * La musique à faire entendre (adresse du fichier, ou null pour le silence), en fondu enchaîné
 * de `fondu` secondes avec la précédente. Une même piste continue sans repartir du début.
 */
export function musique(url: string | null, fondu = 3) {
  if (url === voulue) return
  if (voulue) pistes.get(voulue)?.arreter(fondu)
  voulue = url
  if (!url) return
  let p = pistes.get(url)
  if (!p) {
    p = new Piste(url)
    pistes.set(url, p)
  }
  p.jouer(fondu)
}

/** Son coupé ou remis (bouton du header) */
export function couperMusique(coupe: boolean) {
  muet = coupe
  if (general) fondre(general, muet || cache ? 0 : 1, FONDU_GENERAL)
}

/** Volume des sons d'interface (0 → 1) */
const VOLUME_SONS = 0.5

/**
 * Sons d'interface. « Soft UI Pop » de humordome (Pixabay, licence Pixabay : sans mention
 * obligatoire), réduit à ses trois premiers pops (0,32 s, mono) : sons/LISEZ-MOI.txt
 */
export const sons = {
  clic: versionne('/assets/sons/clic.wav'),
}

/** Sons décodés une fois pour toutes : ils partent sans délai */
const tampons = new Map<string, Promise<AudioBuffer | null>>()
function tampon(url: string) {
  let t = tampons.get(url)
  if (!t) {
    const { ctx } = audio()
    t = fetch(url)
      .then((r) => r.arrayBuffer())
      .then((b) => ctx.decodeAudioData(b))
      .catch(() => null)
    tampons.set(url, t)
  }
  return t
}

/** Prépare les sons d'interface (au démarrage du site) */
export function prechargerSons() {
  return Promise.all(Object.values(sons).map(tampon)).then(() => {})
}

/**
 * Débloque le son : à appeler dans un clic (le bouton « Entrer avec le son » de l'écran
 * d'accueil), seul moment où le navigateur l'autorise
 */
export function debloquerSon() {
  const { ctx } = audio()
  ctx.resume()
  pistes.forEach((p) => p.reprendre())
}

/** Commence à télécharger une musique sans la jouer ; la promesse se résout quand elle peut démarrer */
export function prechargerMusique(url: string) {
  let p = pistes.get(url)
  if (!p) {
    p = new Piste(url)
    pistes.set(url, p)
  }
  return p.prete()
}

/**
 * Joue un son d'interface (rien si le son est coupé ou avant le premier geste du visiteur) ;
 * `vitesse` change aussi sa hauteur (1 = tel quel) ; `retard` en secondes, sur l'horloge audio
 */
export function son(url: string, volume = VOLUME_SONS, vitesse = 1, retard = 0) {
  if (muet || cache) return
  const { ctx, general } = audio()
  if (ctx.state !== 'running') ctx.resume() // appelé dans un clic : le navigateur l'autorise
  tampon(url).then((b) => {
    if (!b || ctx.state !== 'running') return
    const source = ctx.createBufferSource()
    source.buffer = b
    source.playbackRate.value = vitesse
    const gain = ctx.createGain()
    gain.gain.value = volume
    source.connect(gain).connect(general)
    source.start(ctx.currentTime + retard)
  })
}


/** Clic d'ouverture d'un popup ou de changement de page */
export const cliquer = () => son(sons.clic)

// Onglet caché : la musique s'efface, et revient avec lui
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    cache = document.hidden
    if (general) fondre(general, muet || cache ? 0 : 1, FONDU_GENERAL)
    if (!cache) pistes.forEach((p) => p.reprendre())
  })
}

// Mise au point (développement uniquement) : état de la musique depuis la console
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__musique = {
    get contexte() {
      return contexte
    },
    get general() {
      return general
    },
    get voulue() {
      return voulue
    },
    pistes,
  }
}
