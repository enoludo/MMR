import { useSyncExternalStore } from 'react'
import type { Onglet } from './oeuvres'

/** Une salle chargée dans la scène : l'œuvre exposée, et une clé unique (une par visite de salle). */
export type SalleVisitee = { cle: number; oeuvre: string }
let derniereCle = 0
export const nouvelleCle = () => ++derniereCle
/** Sens d'un passage : vers l'œuvre suivante (par la sortie) ou précédente (par l'entrée) */
export type Sens = 'suivante' | 'precedente'
export type Passage = SalleVisitee & { sens: Sens }

/** Carte de la spirale à l'écran : centre (px), taille (px) et inclinaison (radians, sens horaire) */
export type Cadre = {
  x: number
  y: number
  largeur: number
  hauteur: number
  angle: number
  /** Carte de la spirale : son éclairage (lumière linéaire, 1 = l'image telle quelle) */
  eclairage?: number
}
/**
 * Transition entre la spirale et une salle (voir ui/Transition.tsx) :
 * - entrée : la salle se monte et se prépare sous la spirale (preparation), la carte grandit
 *   (zoom), on attend que la salle soit dessinée (attente), fondu ;
 * - sortie : la caméra rejoint la vue initiale de la salle (retour), on la photographie (photo),
 *   photo plein écran, on attend la spirale (attente), elle se réduit en carte (zoom), fondu.
 */
export type Transition = {
  sens: 'entree' | 'sortie'
  oeuvre: string
  phase: 'preparation' | 'retour' | 'photo' | 'zoom' | 'attente' | 'fondu'
  /** Entrée : la carte cliquée ; sortie : la carte d'arrivée, posée par la spirale une fois prête */
  carte: Cadre | null
  /** Sortie : la salle telle qu'on la quitte */
  image: HTMLCanvasElement | null
}

/**
 * Petit état global partagé entre la scène 3D et l'interface HTML
 * (sans dépendance : un store minimal suffit pour l'instant).
 */
type Etat = {
  /** Étape choisie (index), ou null quand on est sur le cercle */
  etape: number | null
  /** Vrai quand la caméra est arrivée à l'étape */
  arrive: boolean
  /** Demande venant de l'interface (consommée par la navigation) :
   *  un index d'étape, ou « cercle » pour revenir sur le cercle */
  demande: number | 'cercle' | null
  /** Salle où l'on se trouve (null hors des salles) */
  salle: SalleVisitee | null
  /**
   * Passage en cours vers une autre salle, par la porte et le couloir : la salle
   * d'arrivée est chargée au bout du couloir ; à l'arrivée, elle devient « salle ».
   */
  passage: Passage | null
  /** Transition en cours entre la spirale et une salle */
  transition: Transition | null
  /** Clé de la dernière salle dessinée à l'écran (chargée, matières compilées) */
  salleAffichee: number | null
  /** Clé de la salle préparée sous la spirale (textures envoyées, matières compilées), voir Experience */
  sallePrete: number | null
  /** Œuvre sur laquelle la spirale se recentre à son retour (dernière salle visitée ou carte centrée) */
  derniereOeuvre: string | null
  /** Ce qu'affiche la salle : le premier écran (info) ou un popup (maladie, manifeste) */
  onglet: Onglet
  /** Son coupé (bouton du header ; pas encore de son dans le site) */
  muet: boolean
  /** Menu principal ouvert */
  menu: boolean
  dev: boolean
}

let etat: Etat = {
  salle: null,
  passage: null,
  etape: null,
  transition: null,
  salleAffichee: null,
  sallePrete: null,
  derniereOeuvre: null,
  arrive: false,
  demande: null,
  onglet: 'info',
  muet: false,
  menu: false,
  dev: false,
}
const abonnes = new Set<() => void>()

export const store = {
  get: () => etat,
  set(partiel: Partial<Etat>) {
    etat = { ...etat, ...partiel }
    abonnes.forEach((f) => f())
  },
  subscribe(f: () => void) {
    abonnes.add(f)
    return () => abonnes.delete(f)
  },
}

export function useEtat<T>(selection: (e: Etat) => T): T {
  return useSyncExternalStore(store.subscribe, () => selection(store.get()))
}
