import { useEffect, useRef, useState } from 'react'
import { CONFIG } from './config.js'
import { SpiralGallery } from './gallery/SpiralGallery.js'
import { VirtualScroll } from './gallery/VirtualScroll.js'
import { Overlay } from './gallery/Overlay.js'
import { BackgroundTint } from './gallery/BackgroundTint.js'
import { getCenteredSlot } from './gallery/centeredSlot.js'
import { cartesSpirale } from '../oeuvres'
import { EnTete } from '../ui/EnTete'
import { IconeFleche } from '../ui/icones'
import { store, useEtat } from '../store'
import { carteVivante, entrer, prechargerOeuvre } from '../transition'
import { imagePrete } from '../ui/ToileTransition'
import { ResolutionAdaptative } from '../resolution'
import { cliquer } from '../musique'
import { avancer, prevoir } from '../chargement'

/** Une carte restée centrée ce temps-là (ms) : on précharge sa salle */
const DELAI_PRECHARGEMENT = 1000
/** « Découvrir » sur une carte pas tout à fait centrée : elle glisse au centre avant de grandir (s, pour un écart d'une carte) */
const DUREE_CENTRAGE = 0.45
const reduitMouvement = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/** Écran d'accueil affiché (ui/Intro.tsx) : la spirale se prépare dessous, son titre attend */
const enIntro = () => {
  const i = store.get().intro
  return i === 'chargement' || i === 'pret'
}
/** À l'entrée dans la visite, le titre de la carte attend que le logo de l'écran d'accueil soit parti (ms) */
const TITRE_APRES_INTRO = 500
/**
 * Écran d'accueil prêt depuis ce temps-là (ms), immobile (boutons affichés) : on peut précharger la
 * salle de la carte centrée, qui fige la page ≈ 0,5 s ; pendant l'allumage du logo, il se voyait
 */
const PRECHARGEMENT_APRES_INTRO = 1800

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
    /** Instant où l'on est entré dans la visite (sortie de l'écran d'accueil) */
    let sortieIntro = 0
    /** Instant où l'écran d'accueil est devenu prêt */
    let introPrete = 0
    let centre: { slot: (typeof galerie.slots)[number]; carte: (typeof cartesSpirale)[number] } | null = null
    let centreDepuis = 0
    /** Carte 3D cachée sous l'image de la transition */
    let cachee: (typeof galerie.slots)[number] | null = null
    /** Retour d'une salle : nombre de cartes prêtes au dernier dessin de la spirale cachée */
    let dessinees = -1
    // Retour d'une salle : on ne dessine qu'une fois les shaders compilés sans bloquer (le premier
    // dessin les compilait d'un coup, ≈ 0,3 s figées au départ de la caméra), une fois posées les
    // images des cartes déjà préparées (elles arrivent juste après la construction)
    /** « Découvrir » : la carte glisse au centre, puis l'entrée commence */
    let centrage: { carte: string; depart: number; cible: number; debut: number; duree: number } | null = null
    // Écran d'accueil : images des cartes et calculs d'affichage comptent dans son chargement
    const accueil = enIntro()
    if (accueil) {
      prevoir('spirale-images', 3)
      prevoir('spirale-calcul', 2)
    }
    let prete = !store.get().transition && !accueil
    if (!prete)
      setTimeout(() =>
        galerie
          .prepare()
          .catch(() => {})
          .then(() => {
            prete = true
            avancer('spirale-calcul', 1)
          }),
      )
    // Baisse la résolution si la machine peine, la remonte quand elle suit (voir resolution.ts)
    const resolution = new ResolutionAdaptative((r) => galerie.renderer.setPixelRatio(r))
    let avant = performance.now()
    const animer = () => {
      raf = requestAnimationFrame(animer)
      const transition = store.get().transition
      const maintenant = performance.now()
      resolution.image((maintenant - avant) / 1000, !!transition || !prete)
      avant = maintenant
      const versSalle = transition?.sens === 'entree' && (transition.phase === 'preparation' || transition.phase === 'zoom')
      // Entrée : la carte cliquée vient se placer exactement au centre (la même position qu'au retour),
      // l'image de la transition la suit ; sinon, figée pendant une transition
      if (versSalle) y += (galerie.offsetForCard(transition.oeuvre, y) - y) * 0.15
      else if (centrage) {
        const u = centrage.duree ? Math.min(1, (performance.now() - centrage.debut) / 1000 / centrage.duree) : 1
        y = u < 1 ? centrage.depart + (centrage.cible - centrage.depart) * (u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2) : centrage.cible
        scroll.virtualOffset = centrage.cible // molette et glisser ignorés le temps du centrage
      } else if (!transition) y += (scroll.tick() - y) * CONFIG.rotationLerp
      if (transition) scroll.virtualOffset = y
      galerie.update(y)
      const slot = getCenteredSlot(galerie.slots, galerie.camera)
      const carte = cartesSpirale[slot.index % cartesSpirale.length]
      if (versSalle) carteVivante.cadre = galerie.cardScreenFrame(slot)
      // Sous l'image de la transition, la carte 3D est cachée : elle grandirait avec la spirale sans
      // avoir tout à fait la forme de l'image, et ses bords dépasseraient. On la revoit au fondu du retour.
      const aCacher =
        transition && !(transition.sens === 'sortie' && transition.phase === 'fondu') && imagePrete(carte.imageTransition)
          ? slot
          : null
      if (cachee !== aCacher) {
        if (cachee) cachee.mesh.visible = true
        if (aCacher) aCacher.mesh.visible = false
        cachee = aCacher
      }
      if (carte.id !== centre?.carte.id) centreDepuis = performance.now()
      else if (performance.now() - centreDepuis > DELAI_PRECHARGEMENT && peutPrecharger()) prechargerOeuvre(carte.id)
      centre = { slot, carte }
      // Titre de la carte : il part lettre par lettre au clic sur « Découvrir », et revient de même
      // au retour d'une salle, quand l'image se fond dans la carte
      if (store.get().intro === 'sortie') sortieIntro ||= maintenant
      if (store.get().intro === 'pret') introPrete ||= maintenant
      const titreAttend = enIntro() || (store.get().intro === 'sortie' && maintenant - sortieIntro < TITRE_APRES_INTRO)
      if ((transition && !(transition.sens === 'sortie' && transition.phase === 'fondu')) || titreAttend) overlay.cacher()
      else overlay.montrer()
      if (accueil) avancer('spirale-images', galerie.slots.filter((s) => s.texture).length / galerie.slots.length)
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
      // La carte est au centre : elle grandit à partir de là
      if (centrage && y === centrage.cible) {
        const id = centrage.carte
        centrage = null
        if (carte.id === id) entrer(id, galerie.cardScreenFrame(slot))
      }
    }
    function peutPrecharger() {
      const i = store.get().intro
      return i === null || i === 'sortie' || (i === 'pret' && introPrete > 0 && performance.now() - introPrete > PRECHARGEMENT_APRES_INTRO)
    }
    animer()
    decouvrir.current = () => {
      if (!centre || centrage || store.get().transition) return
      const cible = galerie.offsetForCard(centre.carte.id, y)
      const ecart = Math.abs(cible - y) / (CONFIG.pitch / CONFIG.slotsPerTurn)
      // Déjà centrée (à un pixel près) : on entre tout de suite
      if (ecart < 0.003) return entrer(centre.carte.id, galerie.cardScreenFrame(centre.slot))
      prechargerOeuvre(centre.carte.id)
      clearTimeout(scroll.snapTimeout ?? undefined)
      const duree = reduitMouvement() ? 0 : DUREE_CENTRAGE * Math.min(1, Math.sqrt(ecart) + 0.3)
      centrage = { carte: centre.carte.id, depart: y, cible, debut: performance.now(), duree }
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
              cliquer()
              decouvrir.current()
            }}
          >
            <span className="gallery-card-cta-label" />
          </a>
        </div>
      </div>

      <div className="accueil__fleches">
        <button type="button" className="bouton-rond" aria-label="Carte précédente" onClick={() => defiler.current(-1)}>
          <IconeFleche />
        </button>
        <button type="button" className="bouton-rond" aria-label="Carte suivante" onClick={() => defiler.current(1)}>
          <IconeFleche suivant />
        </button>
      </div>
    </div>
  )
}
