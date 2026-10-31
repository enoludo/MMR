/**
 * Résolution adaptative, pour la spirale et pour les salles : sur un écran Retina, l'image 3D est
 * dessinée en double résolution (2880 × 1800 pixels en 1440 × 900), ce qui coûte le plus à la carte
 * graphique. Si les images tombent sous 50 par seconde, on dessine avec un peu moins de pixels
 * (par pas de 0,25), sans descendre sous le plancher ; quand elles tiennent 60 par seconde un
 * moment, on remonte. L'interface (textes, boutons) n'est pas touchée.
 */

/**
 * Réglables touche M, « Rendu » : résolution minimale (2 = Retina pleine, 1 = un pixel par point) ;
 * part de la résolution gardée pendant un passage entre salles (1 = pas de baisse)
 */
export const qualite = { plancher: 1.5, passage: 0.65 }

/** Résolution pleine : celle de l'écran, plafonnée à 2 */
export const resolutionMax = () => Math.min(window.devicePixelRatio || 1, 2)

/** Mesure sur une demi-seconde d'images */
const FENETRE = 0.5
/** Sous ce rythme, on baisse */
const IPS_BAS = 50
/** Au-dessus, l'image tient l'écran (60 par seconde) */
const IPS_HAUT = 57
/** Temps à tenir ce rythme avant de remonter (s) */
const AVANT_REMONTEE = 4
/** Après autant de remontées suivies d'une baisse, on reste où l'on est (pas de va-et-vient) */
const ESSAIS_MAX = 3

export class ResolutionAdaptative {
  ratio = resolutionMax()
  private duree = 0
  private images = 0
  private stable = 0
  private remontee = false
  private essais = 0
  /** Résolution d'avant le passage en cours, rendue à l'arrivée */
  private avantPassage: number | null = null

  constructor(public appliquer: (ratio: number) => void) {}

  /** À chaque image, avec sa durée (s) ; `pause` pendant un chargement ou une transition */
  image(dt: number, pause = false) {
    // Passage : résolution baissée exprès, sous le plancher, et images plus lourdes (deux salles)
    if (this.avantPassage !== null) {
      this.duree = this.images = 0
      return
    }
    const max = resolutionMax()
    const plancher = Math.min(max, qualite.plancher)
    // Plancher changé (touche M) ou fenêtre déplacée sur un autre écran
    const borne = Math.min(max, Math.max(plancher, this.ratio))
    if (borne !== this.ratio) return this.changer(borne)
    // Chargement, onglet caché, transition : ces images ne disent rien du rythme de la salle
    if (pause || dt > 0.1) {
      this.duree = this.images = 0
      return
    }
    this.duree += dt
    this.images++
    if (this.duree < FENETRE) return
    const ips = this.images / this.duree
    this.duree = this.images = 0
    if (ips < IPS_BAS && this.ratio > plancher) {
      if (this.remontee) this.essais++
      this.remontee = false
      this.changer(Math.max(plancher, this.ratio - 0.25))
    } else if (ips >= IPS_HAUT) {
      this.stable += FENETRE
      if (this.stable < AVANT_REMONTEE) return
      // La dernière remontée a tenu : ce n'était pas un essai manqué
      this.remontee = false
      this.stable = 0
      if (this.ratio < max && this.essais < ESSAIS_MAX) {
        this.remontee = true
        this.changer(Math.min(max, this.ratio + 0.25))
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
    if (actif && this.avantPassage === null && qualite.passage < 1) {
      this.avantPassage = this.ratio
      this.changer(Math.round(this.ratio * qualite.passage * 100) / 100)
    } else if (!actif && this.avantPassage !== null) {
      const ratio = this.avantPassage
      this.avantPassage = null
      this.changer(ratio)
    }
  }

  private changer(ratio: number) {
    this.ratio = ratio
    this.stable = 0
    this.appliquer(ratio)
  }
}
