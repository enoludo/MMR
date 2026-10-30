import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import gsap from 'gsap'
import havas from './intro/havas.svg?raw'
import { store, useEtat } from '../store'
import { avancer, prevoir, progression } from '../chargement'
import { debloquerSon, prechargerSons } from '../musique'
import { IconeSon } from './icones'

/** L'écran reste au moins ce temps-là (s) : le logo a le temps de s'allumer */
const DUREE_MIN = 1.6
/** Le logo s'allume jusque-là au rythme du temps, sans attendre (le début du chargement avance peu) */
const PART_DU_TEMPS = 0.6
/** Au-delà (s), on n'attend plus ce qui manque : les boutons apparaissent */
const ATTENTE_MAX = 25
/** Durée de la sortie : cascade des éléments, puis le voile s'efface (s) */
const DUREE_SORTIE = 1.6
/** Largeur du logo dans son SVG, pour dévoiler la signature */
const LARGEUR_LOGO = 632.5

const delais = (apparition: number, sortie: number) => ({ '--d': `${apparition}s`, '--s': `${sortie}s` }) as CSSProperties

/**
 * Écran d'accueil et de chargement (maquette Figma 118:1180) : sur fond noir, le logo MMR s'allume
 * point par point (case par case sur la trame de ses points) à mesure que le site charge
 * (chargement.ts) ; une fois tout chargé, la visite apparaît en fondu sous un voile sombre. Puis
 * la signature s'écrit et deux boutons
 * apparaissent : « Entrer avec le son » et « Entrer sans le son ». Ce clic, obligatoire, est aussi
 * le geste qui permet au navigateur de lancer le son. Ensuite tout part en cascade et la visite
 * apparaît sous le voile qui s'efface.
 *
 * Le logo et les styles sont écrits dans index.html (affichés avant le JavaScript) : ce composant
 * pilote cet écran déjà là et y ajoute le bas (Havas, phrase, boutons).
 */
export function Intro() {
  const intro = useEtat((e) => e.intro)
  const [racine] = useState(() => document.getElementById('intro-statique'))
  const bas = racine?.querySelector('.intro__bas')
  const entrer = useRef<HTMLButtonElement>(null)

  // Ce que tout le site attend : les polices et les sons d'interface
  useEffect(() => {
    racine?.removeAttribute('aria-hidden')
    prevoir('polices')
    prevoir('sons')
    if (document.fonts) document.fonts.ready.then(() => avancer('polices', 1))
    else avancer('polices', 1)
    prechargerSons().then(() => avancer('sons', 1))
  }, [racine])

  // Les cases du logo s'allument au rythme du chargement (et pas plus vite que DUREE_MIN) ; la
  // visite apparaît sous le voile quand tout est chargé
  useEffect(() => {
    if (!racine || intro !== 'chargement') return
    const points = [...racine.querySelectorAll('.intro__case')]
    const debut = performance.now()
    let affiche = 0
    let complet = 0
    let raf = 0
    const image = () => {
      raf = requestAnimationFrame(image)
      const t = (performance.now() - debut) / 1000
      const temps = Math.min(1, t / DUREE_MIN)
      const reel = t > ATTENTE_MAX ? 1 : progression()
      if (reel >= 1) racine.classList.add('intro--fond')
      const cible = Math.min(Math.max(reel, PART_DU_TEMPS * temps), temps)
      affiche += (cible - affiche) * 0.12
      const n = cible >= 1 && affiche > 0.97 ? points.length : Math.floor(affiche * points.length)
      points.forEach((p, i) => p.classList.toggle('allume', i < n))
      // Tout est allumé : un court temps (la dernière case finit de s'allumer), le masque s'efface,
      // puis la signature et les boutons
      if (n < points.length) return
      complet ||= performance.now()
      if (performance.now() - complet > 650) {
        racine.classList.add('intro--complet')
        store.set({ intro: 'pret' })
      }
    }
    image()
    return () => cancelAnimationFrame(raf)
  }, [intro, racine])

  // États de l'écran ; une fois la visite ouverte, il disparaît de la page
  useEffect(() => {
    if (!racine) return
    racine.classList.toggle('intro--pret', intro === 'pret' || intro === 'sortie')
    racine.classList.toggle('intro--sortie', intro === 'sortie')
    document.documentElement.classList.toggle('intro-active', intro === 'chargement' || intro === 'pret')
    if (intro === null) racine.remove()
  }, [intro, racine])

  // Prêt : la signature s'écrit de gauche à droite, puis la main passe au bouton principal
  useEffect(() => {
    if (!racine || intro !== 'pret') return
    const revele = racine.querySelector('.intro__revele')
    const lent = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const tween = revele && gsap.fromTo(revele, { attr: { width: 0 } }, { attr: { width: LARGEUR_LOGO }, duration: lent ? 1.4 : 0, ease: 'power2.inOut' })
    const t = setTimeout(() => entrer.current?.focus({ preventScroll: true }), lent ? 1300 : 0)
    return () => {
      tween?.kill()
      clearTimeout(t)
    }
  }, [intro, racine])

  const partir = (son: boolean) => {
    if (store.get().intro !== 'pret') return
    if (son) debloquerSon() // dans le clic : le navigateur autorise le son
    store.set({ muet: !son, intro: 'sortie' })
    setTimeout(() => store.set({ intro: null }), DUREE_SORTIE * 1000)
  }

  if (!racine || !bas || intro === null) return null
  return createPortal(
    <>
      <div style={delais(0.5, 0.08)} dangerouslySetInnerHTML={{ __html: havas }} />
      <div className="intro__boutons">
        <button type="button" ref={entrer} className="intro__entrer" style={delais(0.9, 0.16)} onClick={() => partir(true)}>
          <IconeSon />
          Entrer avec le son
        </button>
        <button type="button" className="intro__sans" style={delais(1.05, 0.22)} onClick={() => partir(false)}>
          Entrer sans le son
        </button>
      </div>
    </>,
    bas,
  )
}
