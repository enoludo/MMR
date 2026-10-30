import { StrictMode, Suspense, lazy, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom'
import { Leva } from 'leva'
import { CopieReglages } from './ui/CopieReglages'
import '@fontsource-variable/google-sans-flex/wght.css'
import { Accueil } from './accueil/Accueil'
import { APropos } from './pages/APropos'
import { Transition } from './ui/Transition'
import { store, useEtat } from './store'
import './style.css'

// La salle 3D (React Three Fiber) n'est chargée qu'en entrant dans une œuvre
const PageOeuvre = lazy(() => import('./pages/PageOeuvre').then((m) => ({ default: m.PageOeuvre })))
/** Durée de la sortie du texte de la salle vers la spirale (ms, ui/apparition.ts) */
const SORTIE_TEXTE_SALLE = 750
/** Délai avant de démonter la salle quittée, une fois revenu sur la spirale (ms) */
const DEMONTAGE_SALLE = 1500

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
  const idSalle = idAdresse ?? salleQuittee

  // Touche M : panneau de réglages (Leva)
  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'm' || e.key === 'M') store.set({ dev: !store.get().dev })
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
        {idSalle && <PageOeuvre id={idSalle} />}
        <Routes>
          <Route path="/" element={null} />
          <Route path="/oeuvre/:id" element={null} />
          <Route path="/a-propos" element={<APropos />} />
        </Routes>
      </Suspense>
      <Transition />
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
