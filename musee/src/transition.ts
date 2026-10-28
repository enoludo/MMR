import { oeuvres } from './oeuvres'
import { store, type Cadre } from './store'
import { entree } from './entree'
import { prechargerImages } from './ui/ToileTransition'

/**
 * Transitions entre la spirale (accueil) et les salles, et préchargement des salles.
 * Le déroulé (zoom, attente, fondu) est joué par ui/Transition.tsx ; ce module ne fait
 * que les démarrer, depuis la spirale (entrer) ou depuis une salle (sortir).
 */

/** Photographie de la salle à l'écran, posée par la scène 3D tant qu'elle est montée (Experience) */
export const captureSalle: { courante: (() => HTMLCanvasElement | null) | null } = { courante: null }

/** Entrée : cadre de la carte cliquée à l'écran, mis à jour par la spirale qui la recentre (Accueil) */
export const carteVivante: { cadre: Cadre | null } = { cadre: null }

/** Depuis la spirale : la carte `carte` (à l'écran) grandit jusqu'à remplir l'écran, puis la salle apparaît. */
export function entrer(oeuvre: string, carte: Cadre) {
  if (store.get().transition) return
  carteVivante.cadre = null
  prechargerOeuvre(oeuvre)
  store.set({ transition: { sens: 'entree', oeuvre, phase: 'preparation', carte, image: null } })
}

/**
 * Depuis une salle : la caméra rejoint d'abord la vue initiale (celle de la carte, à la
 * parallaxe près), on la photographie, on passe à la spirale sous cette photo, qui se réduit
 * ensuite jusqu'à la carte de l'œuvre (voir ui/Transition.tsx). Renvoie faux si la transition
 * n'a pas lieu (on laisse alors le lien faire son travail).
 */
export function sortir() {
  const { transition, passage, salle } = store.get()
  if (transition) return true // déjà en route
  // Pendant un passage par le couloir, deux salles sont à l'écran : on part sans transition
  if (!salle || passage) return false
  entree.debut = entree.relais = null
  entree.enAttente = false
  store.set({
    transition: { sens: 'sortie', oeuvre: salle.oeuvre, phase: 'retour', carte: null, image: null },
    derniereOeuvre: salle.oeuvre,
    onglet: 'info',
  })
  return true
}

const prechargees = new Set<string>()

/**
 * Télécharge à l'avance la salle d'une œuvre (code de la page, modèles, lightmaps) :
 * appelé quand une carte reste centrée sur la spirale, et au clic sur « Découvrir ».
 */
export function prechargerOeuvre(id: string) {
  const oeuvre = oeuvres.find((o) => o.id === id)
  if (!oeuvre || prechargees.has(id)) return
  prechargees.add(id)
  prechargerImages(oeuvre.image, oeuvre.vueEntree)
  import('./pages/PageOeuvre')
  import('./scene/Salle').then((m) => m.prechargerSalle(oeuvre.salle))
}
