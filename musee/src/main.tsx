import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Leva } from 'leva'
import { CopieReglages } from './ui/CopieReglages'
import '@fontsource-variable/google-sans-flex/wght.css'
import { Accueil } from './accueil/Accueil'
import { APropos } from './pages/APropos'
import { Transition } from './ui/Transition'
import { Musique } from './ui/Musique'
import { Intro } from './ui/Intro'
import { prevoir } from './chargement'
import { salleOuverte } from './oeuvres'
import { store, useEtat } from './store'
import { moteurSalles } from './scene/moteurSalles'
import './style.css'

// La salle 3D (React Three Fiber) n'est chargée qu'en entrant dans une œuvre
const PageOeuvre = lazy(() => import('./pages/PageOeuvre').then((m) => ({ default: m.PageOeuvre })))
/** Durée de la sortie du texte de la salle vers la spirale (ms, ui/apparition.ts) */
const SORTIE_TEXTE_SALLE = 750
/** Délai avant de démonter la salle quittée, une fois revenu sur la spirale (ms) */
const DEMONTAGE_SALLE = 1500

// Arrivée directe dans une salle fermée à la visite (oeuvres.ts) : on arrive sur l'accueil
const salleDemandee = window.location.pathname.match(/^\/oeuvre\/([^/]+)/)?.[1]
if (salleDemandee && !salleOuverte(decodeURIComponent(salleDemandee))) window.history.replaceState(null, '', '/')
// Arrivée directe dans une salle : l'écran d'accueil attend aussi la salle (chargée à la demande)
if (window.location.pathname.startsWith('/oeuvre/')) prevoir('salle', 6)
// Le moteur de rendu des salles est créé pendant l'écran d'accueil, où son arrêt (≈ 0,13 s) ne se
// voit pas, plutôt qu'à l'entrée dans la première salle (scene/moteurSalles.ts)
setTimeout(moteurSalles, 300)

function App() {
  const dev = useEtat((e) => e.dev)
  const { pathname } = useLocation()
  // En entrant dans une salle, la spirale reste à l'écran le temps du zoom de sa carte, pendant
  // que la salle se monte et se prépare dessous (voir ui/Transition.tsx) : elle est donc rendue
  // hors des routes, à la même place dans l'arbre, pour ne pas être recréée
  const zoomVersSalle = useEtat(
    (e) => e.transition?.sens === 'entree' && (e.transition.phase === 'preparation' || e.transition.phase === 'zoom'),
  )
  // Au retour, elle se prépare, cachée sous la salle, pendant que la caméra rejoint la vue
  // initiale : elle est prête à recevoir la photo de la salle, sans temps mort. Montée pendant
  // tout le retour : la phase change une image avant l'adresse, elle serait sinon recréée
  // Seulement une fois le texte de la salle parti (ui/apparition.ts) : son montage fige la page un
  // moment, la sortie du texte n'en montrait sinon que des morceaux (remarque de Ludovic du 30/10)
  const sortieDemandee = useEtat((e) => e.transition?.sens === 'sortie')
  const [retourVersSpirale, setRetourVersSpirale] = useState(false)
  useEffect(() => {
    if (!sortieDemandee) return setRetourVersSpirale(false)
    const t = setTimeout(() => setRetourVersSpirale(true), SORTIE_TEXTE_SALLE)
    return () => clearTimeout(t)
  }, [sortieDemandee])

  // La salle est rendue hors des routes : au retour vers la spirale, elle reste montée, cachée
  // et arrêtée, jusqu'à ce que la spirale soit revenue et immobile. La démonter libère son
  // contexte WebGL (≈ 0,1 s bloquée) : juste après la photo, cela retardait la réduction.
  const idAdresse = pathname.startsWith('/oeuvre/') ? decodeURIComponent(pathname.split('/')[2] ?? '') : null
  const quittee = useEtat((e) => (e.transition?.sens === 'sortie' ? e.transition.oeuvre : null))
  const [salleQuittee, setSalleQuittee] = useState<string | null>(null)
  useEffect(() => {
    if (quittee) {
      setSalleQuittee(quittee)
      return
    }
    const t = setTimeout(() => setSalleQuittee(null), DEMONTAGE_SALLE)
    return () => clearTimeout(t)
  }, [quittee])
  // Chaque entrée depuis la spirale ou la grille monte une salle neuve (`visite.n`, clé de la page) :
  // cliquer une œuvre dans la seconde et demie qui suit un retour reprenait sinon la salle quittée,
  // encore montée, avec sa caméra (04/11 : Huntington vu à la distance du Seuil, et l'inverse). La
  // salle quittée est d'abord démontée (`coupure`, une image), puis la nouvelle montée : elle
  // reprend ainsi le moteur de rendu partagé (scene/moteurSalles.ts) au lieu d'en créer un autre
  const entreeDemandee = useEtat((e) => e.transition?.sens === 'entree')
  const [visite, setVisite] = useState({ n: 0, entree: false, coupure: false })
  if (entreeDemandee !== visite.entree) {
    setVisite({ n: visite.n + (entreeDemandee ? 1 : 0), entree: entreeDemandee, coupure: entreeDemandee })
  }
  useEffect(() => {
    if (visite.coupure) setVisite((v) => ({ ...v, coupure: false }))
  }, [visite.coupure])
  const idSalle = visite.coupure ? null : idAdresse ?? (entreeDemandee ? null : salleQuittee)

  // Touche M : panneau de réglages (Leva)
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'm' || e.key === 'M') store.set({ dev: !store.get().dev })
      // Touche V (développement, dans une salle) : vue libre, pour régler les points de vue (ui/VueLibre.tsx)
      if (import.meta.env.DEV && (e.key === 'v' || e.key === 'V') && store.get().salle && !store.get().passage && !store.get().captures) {
        const libre = !store.get().libre
        store.set({ libre })
        document.documentElement.classList.toggle('vue-libre', libre)
      }
    }
    window.addEventListener('keydown', clavier)
    return () => window.removeEventListener('keydown', clavier)
  }, [])

  // On ferme le menu à chaque changement de page
  useEffect(() => store.set({ menu: false }), [pathname])

  return (
    <>
      <Leva hidden={!dev} collapsed={false} titleBar={{ title: 'Réglages (M)' }} />
      {dev && <CopieReglages />}
      {(pathname === '/' || zoomVersSalle || retourVersSpirale) && <Accueil />}
      <Suspense fallback={null}>
        {idSalle && <PageOeuvre key={visite.n} id={idSalle} />}
        <Routes>
          <Route path="/" element={null} />
          <Route path="/oeuvre/:id" element={null} />
          <Route path="/a-propos" element={<APropos />} />
        </Routes>
      </Suspense>
      <Transition />
      <Musique />
      <Intro />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
