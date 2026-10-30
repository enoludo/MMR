import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { garderMuet, useEtat } from '../store'
import { musiqueSpirale, oeuvres } from '../oeuvres'
import { couperMusique, musique, prechargerMusique, prechargerSons } from '../musique'
import { avancer, prevoir } from '../chargement'

/** Fondus enchaînés entre deux musiques (s) */
const FONDU_DEPART = 3
const FONDU_TRANSITION = 2.5
const FONDU_PASSAGE = 4

/** Musique d'une œuvre : la sienne, à défaut celle de la spirale */
const musiqueDe = (id: string | undefined) => oeuvres.find((o) => o.id === id)?.musique ?? musiqueSpirale

/**
 * Choisit la musique selon l'endroit de la visite (voir musique.ts) : celle de la salle où l'on
 * est, celle de la salle d'arrivée dès le départ d'un passage (le fondu se fait dans le couloir),
 * celle de la spirale ailleurs ; les allers-retours avec la spirale passent en fondu enchaîné.
 */
export function Musique() {
  const { pathname } = useLocation()
  const muet = useEtat((e) => e.muet)
  const cible = useEtat((e) => {
    if (e.transition) return e.transition.sens === 'entree' ? musiqueDe(e.transition.oeuvre) : musiqueSpirale
    if (e.passage) return musiqueDe(e.passage.oeuvre)
    return null
  })
  const fondu = useEtat((e) => (e.transition ? FONDU_TRANSITION : e.passage ? FONDU_PASSAGE : FONDU_DEPART))
  const salle = pathname.startsWith('/oeuvre/') ? decodeURIComponent(pathname.split('/')[2] ?? '') : null
  const voulue = cible ?? (salle ? musiqueDe(salle) : musiqueSpirale)
  // Écran d'accueil : la musique se télécharge, et ne démarre qu'à l'entrée dans la visite
  const enIntro = useEtat((e) => e.intro === 'chargement' || e.intro === 'pret')

  useEffect(() => {
    prechargerSons()
  }, [])
  useEffect(() => {
    if (!enIntro) return
    prevoir('musique')
    prechargerMusique(voulue).then(() => avancer('musique', 1))
  }, [enIntro, voulue])
  useEffect(() => musique(enIntro ? null : voulue, fondu), [enIntro, voulue, fondu])
  useEffect(() => {
    couperMusique(muet)
    garderMuet(muet)
  }, [muet])
  return null
}
