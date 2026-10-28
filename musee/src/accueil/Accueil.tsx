import { useEffect, useRef, useState } from 'react'
import { CONFIG } from './config.js'
import { SpiralGallery } from './gallery/SpiralGallery.js'
import { VirtualScroll } from './gallery/VirtualScroll.js'
import { Overlay } from './gallery/Overlay.js'
import { BackgroundTint } from './gallery/BackgroundTint.js'
import { getCenteredSlot } from './gallery/centeredSlot.js'
import { cartesSpirale } from '../oeuvres'
import { EnTete } from '../ui/EnTete'
import { store, useEtat } from '../store'
import { carteVivante, entrer, prechargerOeuvre } from '../transition'
import { imagePrete } from '../ui/ToileTransition'

/** Une carte restée centrée ce temps-là (ms) : on précharge sa salle */
const DELAI_PRECHARGEMENT = 1000

/**
 * Page d'accueil : la galerie spirale (projet « Galerie spirale », racine de ~/MMR),
 * dans sa version finale (GitHub enoludo/MMR, commit 0b9abe8). Son code Three.js vit dans ./gallery ; ce composant ne fait
 * que le monter, l'animer et le démonter quand on entre dans une salle.
 * Le header de la galerie est remplacé par le header commun du site.
 *
 * Transitions (voir ui/Transition.tsx) : « Découvrir » fait grandir la carte centrée
 * jusqu'à la salle ; au retour, la spirale revient sur l'œuvre quittée et donne la place
 * de sa carte, où se réduit l'image de la salle. Pendant une transition, la spirale est figée.
 */
export function Accueil() {
  const fond = useRef<HTMLDivElement>(null)
  const toile = useRef<HTMLDivElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)
  const cta = useRef<HTMLAnchorElement>(null)
  const [vue, setVue] = useState<'spirale' | 'grille'>('spirale')
  /** Flèches précédente / suivante (bloc Figma « SliderControls ») */
  const defiler = useRef<(sens: number) => void>(() => {})
  /** « Découvrir » : entrée dans la salle de la carte centrée, par la transition */
  const decouvrir = useRef<() => void>(() => {})
  const transition = useEtat((e) => e.transition)

  useEffect(() => {
    const galerie = new SpiralGallery({ container: toile.current!, cardsData: cartesSpirale })
    const scroll = new VirtualScroll({
      wheelTarget: window,
      dragTarget: toile.current!,
      pickDragAnchor: (x: number, y: number) => galerie.pickDragAnchor(x, y),
      anchorScreenX: (ancre: unknown, scrollY: number) => galerie.anchorScreenX(ancre, scrollY),
    })
    defiler.current = (sens: number) => scroll.stepToAdjacentCard(sens)
    if (import.meta.env.DEV) (window as unknown as { __spirale: unknown }).__spirale = { galerie, scroll }
    const overlay = new Overlay({ titleEl: titre.current!, ctaEl: cta.current! })
    // Même couleur de départ que le fond CSS de .accueil
    const teinte = new BackgroundTint(fond.current!, { r: 24, g: 20, b: 16 })

    // On revient sur l'œuvre quittée (ou la carte centrée au départ de la spirale)
    const derniere = store.get().derniereOeuvre
    let y = derniere ? galerie.offsetForCard(derniere) : 0
    scroll.virtualOffset = y

    // Retour d'une salle : le titre attend, caché, que l'image se fonde dans la carte
    if (store.get().transition) overlay.cacher()

    let raf = 0
    let centre: { slot: (typeof galerie.slots)[number]; carte: (typeof cartesSpirale)[number] } | null = null
    let centreDepuis = 0
    /** Carte 3D cachée sous l'image de la transition */
    let cachee: (typeof galerie.slots)[number] | null = null
    /** Retour d'une salle : nombre de cartes prêtes au dernier dessin de la spirale cachée */
    let dessinees = -1
    // Retour d'une salle : on ne dessine qu'une fois les shaders compilés sans bloquer (le premier
    // dessin les compilait d'un coup, ≈ 0,3 s figées au départ de la caméra), une fois posées les
    // images des cartes déjà préparées (elles arrivent juste après la construction)
    let prete = !store.get().transition
    if (!prete)
      setTimeout(() =>
        galerie
          .prepare()
          .catch(() => {})
          .then(() => (prete = true)),
      )
    const animer = () => {
      raf = requestAnimationFrame(animer)
      const transition = store.get().transition
      const versSalle = transition?.sens === 'entree' && (transition.phase === 'preparation' || transition.phase === 'zoom')
      // Entrée : la carte cliquée vient se placer exactement au centre (la même position qu'au retour),
      // l'image de la transition la suit ; sinon, figée pendant une transition
      if (versSalle) y += (galerie.offsetForCard(transition.oeuvre, y) - y) * 0.15
      else if (!transition) y += (scroll.tick() - y) * CONFIG.rotationLerp
      if (transition) scroll.virtualOffset = y
      galerie.update(y)
      const slot = getCenteredSlot(galerie.slots, galerie.camera)
      const carte = cartesSpirale[slot.index % cartesSpirale.length]
      if (versSalle) carteVivante.cadre = galerie.cardScreenFrame(slot)
      // Sous l'image de la transition, la carte 3D est cachée : elle grandirait avec la spirale sans
      // avoir tout à fait la forme de l'image, et ses bords dépasseraient. On la revoit au fondu du retour.
      const aCacher =
        transition && !(transition.sens === 'sortie' && transition.phase === 'fondu') && imagePrete(carte.image)
          ? slot
          : null
      if (cachee !== aCacher) {
        if (cachee) cachee.mesh.visible = true
        if (aCacher) aCacher.mesh.visible = false
        cachee = aCacher
      }
      if (carte.id !== centre?.carte.id) centreDepuis = performance.now()
      else if (performance.now() - centreDepuis > DELAI_PRECHARGEMENT) prechargerOeuvre(carte.id)
      centre = { slot, carte }
      // Titre de la carte : il part lettre par lettre au clic sur « Découvrir », et revient de même
      // au retour d'une salle, quand l'image se fond dans la carte
      if (transition && !(transition.sens === 'sortie' && transition.phase === 'fondu')) overlay.cacher()
      else overlay.montrer()
      overlay.setCard(carte)
      teinte.setCard(carte, galerie.cardColors.get(carte.id))
      // Retour d'une salle, pendant que la caméra rejoint la vue initiale : la spirale, cachée,
      // n'est dessinée que lorsqu'une image de carte arrive (envoi à la carte graphique,
      // compilation), pour ne pas ralentir la salle
      const enCoulisse = transition?.sens === 'sortie' && (transition.phase === 'retour' || transition.phase === 'photo')
      const pretes = enCoulisse ? galerie.slots.filter((s) => s.texture).length : -1
      if (prete && (!enCoulisse || pretes !== dessinees)) {
        galerie.render()
        dessinees = pretes
      }
      // Retour d'une salle : dès que la carte est dessinée, on donne sa place à l'écran
      if (transition?.sens === 'sortie' && transition.phase === 'attente' && slot.texture && prete) {
        store.set({ transition: { ...transition, phase: 'zoom', carte: galerie.cardScreenFrame(slot) } })
      }
    }
    animer()
    decouvrir.current = () => {
      if (centre) entrer(centre.carte.id, galerie.cardScreenFrame(centre.slot))
    }

    let rafResize = 0
    const redimensionner = () => {
      cancelAnimationFrame(rafResize)
      rafResize = requestAnimationFrame(() => {
        galerie.resize()
        galerie.refreshSlotCountForWidth(window.innerWidth)
      })
    }
    window.addEventListener('resize', redimensionner)

    return () => {
      if (centre) store.set({ derniereOeuvre: centre.carte.id })
      cancelAnimationFrame(raf)
      cancelAnimationFrame(rafResize)
      window.removeEventListener('resize', redimensionner)
      scroll.dispose()
      overlay.dispose()
      teinte.dispose()
      galerie.dispose()
    }
  }, [])

  return (
    <div
      className={`accueil ${transition ? 'accueil--transition' : ''} ${
        transition?.sens === 'sortie' && (transition.phase === 'retour' || transition.phase === 'photo') ? 'accueil--cachee' : ''
      }`}
      ref={fond}
    >
      <div className="accueil__toile" ref={toile} />

      <EnTete
        centre={
          <div className="onglets" role="tablist" aria-label="Mode d'affichage">
            {(['spirale', 'grille'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vue === v}
                className={`onglets__onglet ${vue === v ? 'actif' : ''}`}
                onClick={() => setVue(v)}
              >
                {v === 'spirale' ? 'Spirale' : 'Grille'}
              </button>
            ))}
          </div>
        }
      />

      <div className="accueil__carte" aria-live="polite">
        <div className="accueil__info">
          <h2 className="accueil__titre" ref={titre} />
          <a
            className="accueil__cta"
            ref={cta}
            href="#"
            onClick={(e) => {
              // Lien posé par Overlay.js (href = /oeuvre/…) : la transition navigue sans recharger la page
              e.preventDefault()
              decouvrir.current()
            }}
          >
            <span className="gallery-card-cta-label" />
          </a>
        </div>
      </div>

      <div className="accueil__fleches">
        <button type="button" className="bouton-rond" aria-label="Carte précédente" onClick={() => defiler.current(-1)}>
          <Chevron />
        </button>
        <button type="button" className="bouton-rond" aria-label="Carte suivante" onClick={() => defiler.current(1)}>
          <Chevron suivant />
        </button>
      </div>
    </div>
  )
}

/** Flèche fournie pour la galerie spirale (un seul tracé, retourné pour « suivant »). */
function Chevron({ suivant = false }: { suivant?: boolean }) {
  return (
    <svg width="8" height="14" viewBox="0 0 8 14" fill="none" aria-hidden style={suivant ? { transform: 'scaleX(-1)' } : undefined}>
      <path
        d="M6.41896 13.5376L0.182914 7.30159C-0.0609489 7.058 -0.0609489 6.66277 0.182914 6.41918L6.41896 0.183135C6.75859 -0.156502 7.33854 -0.00110698 7.46285 0.462845C7.52054 0.678166 7.45899 0.907914 7.30136 1.06554L1.50573 6.86039L7.30136 12.6552C7.641 12.9949 7.4856 13.5748 7.02165 13.6991C6.80633 13.7568 6.57659 13.6953 6.41896 13.5376Z"
        fill="currentColor"
      />
    </svg>
  )
}
