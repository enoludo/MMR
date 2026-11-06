/**
 * Résolution adaptative et arbitrages de qualité.
 *
 * Spirale : sur un écran Retina, l'image 3D est dessinée en double résolution, ce qui coûte le plus à
 * la carte graphique. Si les images tombent sous 50 par seconde, on dessine avec un peu moins de
 * pixels (par pas de 0,25), sans descendre sous la résolution minimale ; quand elles tiennent 60 par
 * seconde un moment, on remonte. L'interface (textes, boutons) n'est pas touchée.
 *
 * Salles (06/11, ordre choisi par Ludovic, renoncements.ts) : sous 30 images par seconde, on renonce
 * une marche à la fois à la profondeur de champ, aux reflets, aux halos, à la poussière, à
 * l'anticrénelage ×2 puis ×1 ; en dernier recours, sous 24 images par seconde, on baisse la
 * résolution (sans passer sous la résolution minimale de la touche M). Quand la machine tient 45
 * images par seconde, on remonte dans l'ordre inverse : la résolution d'abord, puis les renoncements.
 * Départ donné par le test de la machine fait pendant l'écran d'accueil (performances.ts).
 */
import { RESOLUTION_MIN, departMachine, machine } from './performances'
import { NIVEAU_MAX, RENONCEMENTS, renoncement } from './renoncements'

/**
 * Réglables touche M, « Rendu » : résolution minimale (de 0 à 2 ; 2 = Retina pleine, 1 = un pixel
 * par point ; jamais sous RESOLUTION_MIN) ; part de la résolution gardée pendant un passage entre
 * salles (1 = pas de baisse)
 */
export const qualite = { plancher: 0, passage: 0.65 }

/**
 * Arbitrages, affichés avec le panneau de réglages (touche M, ui/Arbitrages.tsx ; 06/11, demande de
 * Ludovic) : état en cours de chaque canvas, journal des décisions et de leurs raisons.
 * Interrupteur marche / arrêt : à l'arrêt, tout est là, à pleine résolution, et plus rien ne change
 * (gardé dans le navigateur, `mmr-arbitrages`) ; remis en marche, chaque canvas repart de zéro.
 */
type EtatResolution = { ratio: number; plancher: number; max: number; ips: number | null; niveau: number | null; essais: number }
export const arbitrages = {
  actifs: lireActifs(),
  /** Augmenté à la remise en marche : chaque canvas le compare au sien et repart de zéro */
  generation: 0,
  journal: [] as { heure: string; quoi: string; texte: string }[],
  etat: {} as Record<string, EtatResolution>,
}
function lireActifs() {
  try {
    return localStorage.getItem('mmr-arbitrages') !== 'coupes'
  } catch {
    return true
  }
}
export function couperArbitrages(coupes: boolean) {
  arbitrages.actifs = !coupes
  try {
    localStorage.setItem('mmr-arbitrages', coupes ? 'coupes' : 'actifs')
  } catch {
    // stockage refusé : le choix ne vaut que pour cette page
  }
  if (!coupes) arbitrages.generation++
  noter('—', coupes ? 'Arbitrages arrêtés : tout est là, à pleine résolution' : 'Arbitrages en marche : on repart du départ conseillé par le test')
}
export function noter(quoi: string, texte: string) {
  const d = new Date()
  const heure = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':')
  arbitrages.journal.unshift({ heure, quoi, texte })
  arbitrages.journal.length = Math.min(arbitrages.journal.length, 30)
}
const f2 = (x: number) => x.toFixed(2).replace('.', ',')

/** Résolution pleine : celle de l'écran, plafonnée à 2 */
export const resolutionMax = () => Math.min(window.devicePixelRatio || 1, 2)
/** Résolution minimale effective (touche M « Rendu », jamais sous RESOLUTION_MIN ni au-dessus de l'écran) */
export const resolutionMin = () => Math.min(resolutionMax(), Math.max(RESOLUTION_MIN, qualite.plancher))

/** Mesure sur une demi-seconde d'images */
const FENETRE = 0.5
/** Spirale : sous ce rythme, on baisse */
const IPS_BAS = 50
/** Spirale : au-dessus, l'image tient l'écran (60 par seconde) */
const IPS_HAUT = 57
/** Spirale : temps à tenir ce rythme avant de remonter (s) */
const AVANT_REMONTEE = 4
/** Salles : sous ce rythme, on renonce à la marche suivante */
const IPS_RENONCER = 30
/** Salles : tout renoncé, sous ce rythme, on baisse la résolution */
const IPS_RESOLUTION = 24
/** Salles : au-dessus, pendant AVANT_REPRISE, on reprend une marche */
const IPS_REPRISE = 45
const AVANT_REPRISE = 2
/** Après un changement, temps laissé à la machine (compilation, réallocation) avant de mesurer (s) */
const APRES_CHANGEMENT = 0.5
/** Après autant de reprises suivies d'un renoncement, on reste où l'on est (pas de va-et-vient) */
const ESSAIS_MAX = 3

export class ResolutionAdaptative {
  ratio = resolutionMax()
  private duree = 0
  private images = 0
  private stable = 0
  private remontee = false
  private essais = 0
  private attente = 0
  /** Résolution d'avant le passage en cours, rendue à l'arrivée */
  private avantPassage: number | null = null
  /** Le résultat du test de la machine a été pris en compte (salles : départ) */
  private machineVue = false
  private generation = arbitrages.generation
  private repriseBloqueeNotee = false
  private derniersIps: number | null = null

  /**
   * `salle` : arbitrages des salles (échelle des renoncements, départ donné par le test) ;
   * `nom` : nom du canvas dans le panneau des arbitrages
   */
  constructor(
    public appliquer: (ratio: number) => void,
    private salle = false,
    private nom = 'spirale',
  ) {
    if (salle && arbitrages.actifs) this.depart(false)
  }

  /** Départ conseillé par le test (salles) */
  private depart(changer: boolean) {
    this.machineVue = machine.facteur !== null
    const d = departMachine()
    renoncement.niveau = d.niveau
    const ratio = Math.min(resolutionMax(), Math.max(resolutionMin(), d.ratio))
    if (this.machineVue)
      noter(
        this.nom,
        `départ conseillé par le test : ${d.niveau ? `sans ${RENONCEMENTS.slice(0, d.niveau).join(', ')}` : 'tout'}, résolution ${f2(ratio)}`,
      )
    if (changer && ratio !== this.ratio) this.changer(ratio)
    else this.ratio = ratio
  }

  private publier(plancher: number, max: number) {
    arbitrages.etat[this.nom] = {
      ratio: this.ratio,
      plancher,
      max,
      ips: this.derniersIps,
      niveau: this.salle ? renoncement.niveau : null,
      essais: this.essais,
    }
  }

  /** À chaque image, avec sa durée (s) ; `pause` pendant un chargement ou une transition */
  image(dt: number, pause = false) {
    // Passage : résolution baissée exprès, et images plus lourdes (deux salles) : on ne juge pas
    if (this.avantPassage !== null) {
      this.duree = this.images = 0
      return
    }
    const max = resolutionMax()
    const plancher = resolutionMin()
    // Arbitrages remis en marche : on repart de zéro
    if (this.generation !== arbitrages.generation) {
      this.generation = arbitrages.generation
      this.remontee = this.repriseBloqueeNotee = false
      this.essais = this.stable = this.duree = this.images = 0
      if (this.salle) this.depart(true)
      else if (this.ratio !== max) this.changer(max)
    }
    // Arbitrages arrêtés : tout est là, à pleine résolution
    if (!arbitrages.actifs) {
      if (this.salle) renoncement.niveau = 0
      this.derniersIps = null
      this.publier(max, max)
      if (this.ratio !== max) this.changer(max)
      return
    }
    // Test de la machine terminé après l'arrivée dans la salle
    if (this.salle && !this.machineVue && machine.facteur !== null) return this.depart(true)
    this.publier(plancher, max)
    // Fenêtre déplacée sur un autre écran ; résolution minimale changée (touche M)
    const borne = Math.min(max, Math.max(plancher, this.ratio))
    if (borne !== this.ratio) {
      noter(this.nom, `${f2(this.ratio)} → ${f2(borne)} : ${borne > this.ratio ? 'résolution minimale relevée' : 'limite de l’écran'}`)
      return this.changer(borne)
    }
    // Chargement, onglet caché, transition : ces images ne disent rien du rythme (une image très
    // longue non plus : compilation, envoi d'images à la carte graphique) ; et juste après un changement
    if (pause || dt > 0.25 || this.attente > 0) {
      this.attente = Math.max(0, this.attente - dt)
      this.duree = this.images = 0
      return
    }
    this.duree += dt
    this.images++
    if (this.duree < FENETRE) return
    const ips = this.images / this.duree
    this.derniersIps = ips
    this.duree = this.images = 0
    if (this.salle) this.arbitrerSalle(ips, plancher, max)
    else this.arbitrerSpirale(ips, plancher, max)
  }

  /** Salles : échelle des renoncements, puis résolution en dernier recours */
  private arbitrerSalle(ips: number, plancher: number, max: number) {
    const n = Math.round(ips)
    if (ips < IPS_RENONCER && renoncement.niveau < NIVEAU_MAX) {
      if (this.remontee) this.essais++
      this.remontee = false
      renoncement.niveau++
      this.attente = APRES_CHANGEMENT
      this.stable = 0
      noter(this.nom, `${n} images/s, sous ${IPS_RENONCER} : sans ${RENONCEMENTS[renoncement.niveau - 1]} (marche ${renoncement.niveau}/${NIVEAU_MAX})`)
    } else if (ips < IPS_RESOLUTION && renoncement.niveau === NIVEAU_MAX && this.ratio > plancher) {
      if (this.remontee) this.essais++
      this.remontee = false
      // Le coût suit le nombre de pixels : on retire d'un coup ceux qui empêchent de tenir 30 images/s
      const vise = Math.floor(this.ratio * Math.sqrt(ips / IPS_RENONCER) * 20) / 20
      const ratio = Math.max(plancher, Math.min(this.ratio - 0.1, vise))
      noter(this.nom, `${n} images/s, sous ${IPS_RESOLUTION}, tout renoncé : résolution ${f2(this.ratio)} → ${f2(ratio)}`)
      this.changer(ratio)
    } else if (ips >= IPS_REPRISE) {
      this.stable += FENETRE
      if (this.stable < AVANT_REPRISE) return
      this.stable = 0
      // La dernière reprise a tenu : ce n'était pas un essai manqué
      this.remontee = false
      if (this.ratio >= max && renoncement.niveau === 0) return
      if (this.essais >= ESSAIS_MAX) {
        if (!this.repriseBloqueeNotee) {
          this.repriseBloqueeNotee = true
          noter(this.nom, `reprise bloquée : ${ESSAIS_MAX} reprises suivies d’un renoncement (pas de va-et-vient)`)
        }
        return
      }
      this.remontee = true
      if (this.ratio < max) {
        const ratio = Math.min(max, this.ratio + 0.25)
        noter(this.nom, `${AVANT_REPRISE} s à ${IPS_REPRISE} images/s ou plus : résolution ${f2(this.ratio)} → ${f2(ratio)}`)
        this.changer(ratio)
      } else {
        renoncement.niveau--
        this.attente = APRES_CHANGEMENT
        noter(this.nom, `${AVANT_REPRISE} s à ${IPS_REPRISE} images/s ou plus : ${RENONCEMENTS[renoncement.niveau]} de retour`)
      }
    } else this.stable = 0
  }

  /** Spirale : résolution seule */
  private arbitrerSpirale(ips: number, plancher: number, max: number) {
    if (ips < IPS_BAS && this.ratio > plancher) {
      if (this.remontee) this.essais++
      this.remontee = false
      const ratio = Math.max(plancher, this.ratio - 0.25)
      noter(this.nom, `${Math.round(ips)} images/s, sous ${IPS_BAS} : ${f2(this.ratio)} → ${f2(ratio)}`)
      this.changer(ratio)
    } else if (ips >= IPS_HAUT) {
      this.stable += FENETRE
      if (this.stable < AVANT_REMONTEE) return
      this.remontee = false
      this.stable = 0
      if (this.ratio < max && this.essais < ESSAIS_MAX) {
        this.remontee = true
        const ratio = Math.min(max, this.ratio + 0.25)
        noter(this.nom, `${AVANT_REMONTEE} s à ${IPS_HAUT} images/s ou plus : ${f2(this.ratio)} → ${f2(ratio)}`)
        this.changer(ratio)
      }
    } else this.stable = 0
  }

  /**
   * Passage entre salles : la caméra traverse le couloir assez vite pour qu'une image moins fine ne
   * se voie pas, et les deux salles sont dessinées. Chaque changement de résolution réalloue le
   * canvas et les images des effets (≈ 0,15 s figée) : on baisse au départ, quand la salle d'arrivée
   * se prépare (l'image est déjà retenue), et on remonte une fois arrivé.
   */
  passage(actif: boolean) {
    if (actif && this.avantPassage === null && qualite.passage < 1 && arbitrages.actifs) {
      this.avantPassage = this.ratio
      const ratio = Math.max(RESOLUTION_MIN, Math.round(this.ratio * qualite.passage * 100) / 100)
      noter(this.nom, `passage entre salles : ${f2(this.ratio)} → ${f2(ratio)} (×${f2(qualite.passage)}, rendu à l’arrivée)`)
      this.changer(ratio)
    } else if (!actif && this.avantPassage !== null) {
      const ratio = this.avantPassage
      this.avantPassage = null
      this.changer(ratio)
    }
  }

  private changer(ratio: number) {
    this.ratio = ratio
    this.stable = 0
    this.attente = APRES_CHANGEMENT
    this.appliquer(ratio)
  }
}
