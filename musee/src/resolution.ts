/**
 * Résolution adaptative, pour la spirale et pour les salles : sur un écran Retina, l'image 3D est
 * dessinée en double résolution (2880 × 1800 pixels en 1440 × 900), ce qui coûte le plus à la carte
 * graphique. Si les images tombent sous 50 par seconde, on dessine avec un peu moins de pixels
 * (par pas de 0,25), sans descendre sous le plancher ; quand elles tiennent 60 par seconde un
 * moment, on remonte. L'interface (textes, boutons) n'est pas touchée.
 */

/** Réglable touche M, « Rendu » : résolution minimale (2 = Retina pleine, 1 = un pixel par point) */
export const qualite = { plancher: 1.5 }

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

  constructor(public appliquer: (ratio: number) => void) {}

  /** À chaque image, avec sa durée (s) ; `pause` pendant un chargement ou une transition */
  image(dt: number, pause = false) {
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

  private changer(ratio: number) {
    this.ratio = ratio
    this.stable = 0
    this.appliquer(ratio)
  }
}
