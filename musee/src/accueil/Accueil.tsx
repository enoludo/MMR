import { useEffect, useRef } from 'react'
import { CONFIG } from './config.js'
import { SpiralGallery } from './gallery/SpiralGallery.js'
import { VirtualScroll } from './gallery/VirtualScroll.js'
import { Overlay, reglagesTitres } from './gallery/Overlay.js'
import { LegendesGrille, dispositionGrille, rangsDepuis, reglagesGrille } from './gallery/Grille.js'
import gsap from 'gsap'
import { useControls } from 'leva'
import { boutonCopier } from '../reglages'
import { CaretDownIcon, MagnifyingGlassIcon } from '@phosphor-icons/react'
import { BackgroundTint } from './gallery/BackgroundTint.js'
import { getCenteredSlot } from './gallery/centeredSlot.js'
import { cartesSpirale, salleOuverte } from '../oeuvres'
import { EnTete } from '../ui/EnTete'
import { IconeFleche } from '../ui/icones'
import { store, useEtat } from '../store'
import { carteVivante, entrer, prechargerOeuvre } from '../transition'
import { imagePrete } from '../ui/ToileTransition'
import { ResolutionAdaptative } from '../resolution'
import { cliquer } from '../musique'
import { avancer, prevoir } from '../chargement'

/** Vue Grille : fond noir (BackgroundTint y glisse comme d'une carte à l'autre) */
const NOIR = { r: 0, g: 0, b: 0 }
const FOND_GRILLE = { id: 'grille' }
/** Une carte restée centrée ce temps-là (ms) : on précharge sa salle */
const DELAI_PRECHARGEMENT = 1000
/** Souris restée ce temps-là sur une vignette de la grille (ms) : on précharge sa salle et les images de sa transition */
const DELAI_SURVOL = 200
/** « Découvrir » sur une carte pas tout à fait centrée : elle glisse au centre avant de grandir (s, pour un écart d'une carte) */
const DUREE_CENTRAGE = 0.45
/** Avancée maximale du rangement de la grille en spirale en une image (ms) : une image longue le ralentit au lieu de le faire sauter */
const PAS_MAX = 34
/** Grille quittée pour une salle : son défilement, retrouvé si l'on revient de la même œuvre (la vignette retourne là où on l'a cliquée) */
let grilleQuittee: { oeuvre: string; defilement: number } | null = null
const reduitMouvement = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
/**
 * Au changement de vue (demande de Ludovic, 01/11), les flèches de la spirale et les champs de la
 * recherche (vue Grille) se chassent comme les lettres des titres (Overlay.js) : les sortants
 * partent vers le haut à travers leur masque, l'un après l'autre, les entrants montent du bas
 * `reglagesTitres.delaiEntree` plus tard. Toujours passés en copie : GSAP complète les objets.
 */
const SORTIE_PILULES = { yPercent: -110, autoAlpha: 0, duration: 0.45, ease: 'power2.inOut', stagger: 0.06 }
const ENTREE_PILULES = { yPercent: 110, autoAlpha: 0 }
const APPARITION_PILULES = { yPercent: 0, autoAlpha: 1, duration: 0.8, ease: 'power3.out', stagger: 0.08 }
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
  const grille = useRef<HTMLDivElement>(null)
  const vue = useEtat((e) => e.vueAccueil)
  /** Flèches précédente / suivante (bloc Figma « SliderControls ») */
  const defiler = useRef<(sens: number) => void>(() => {})
  /** « Découvrir » : entrée dans la salle de la carte centrée, par la transition */
  const decouvrir = useRef<() => void>(() => {})
  const transition = useEtat((e) => e.transition)
  const fleches = useRef<HTMLDivElement>(null)
  const recherche = useRef<HTMLDivElement>(null)
  const vueAffichee = useRef<string | null>(null)
  // Flèches (spirale) et recherche (grille) : les unes chassent les autres au changement de vue
  useEffect(() => {
    const pilules = (el: HTMLElement | null) => [...(el?.querySelectorAll<HTMLElement>('.masque > *') ?? [])]
    const sortants = pilules(vue === 'grille' ? fleches.current : recherche.current)
    const entrants = pilules(vue === 'grille' ? recherche.current : fleches.current)
    gsap.killTweensOf([...sortants, ...entrants])
    // Premier affichage : en place, sans mouvement
    if (vueAffichee.current === null || reduitMouvement()) {
      vueAffichee.current = vue
      gsap.set(sortants, { ...ENTREE_PILULES })
      gsap.set(entrants, { yPercent: 0, autoAlpha: 1 })
      return
    }
    vueAffichee.current = vue
    gsap.to(sortants, { ...SORTIE_PILULES })
    gsap.fromTo(entrants, { ...ENTREE_PILULES }, { ...APPARITION_PILULES, delay: reglagesTitres.delaiEntree })
  }, [vue])
  // Touche M : croisement des titres au changement de carte (Overlay.js)
  reglagesTitres.delaiEntree = useControls('Titres de la spirale', {
    ...boutonCopier('Titres de la spirale'),
    delaiEntree: { value: reglagesTitres.delaiEntree, min: 0, max: 0.6, step: 0.01, label: 'entrée du titre suivant (s après le départ)' },
  }).delaiEntree
  // Touche M : pause et reprise de la rotation automatique après un geste (gallery/VirtualScroll.js)
  const rotation = useControls('Rotation de la spirale', {
    ...boutonCopier('Rotation de la spirale'),
    pause: { value: CONFIG.idleDelayMs / 1000, min: 0, max: 15, step: 0.1, label: 'pause après un geste (s)' },
    reprise: { value: CONFIG.autoRotateRampMs / 1000, min: 0, max: 8, step: 0.1, label: 'durée de la reprise (s)' },
  })
  CONFIG.idleDelayMs = rotation.pause * 1000
  CONFIG.autoRotateRampMs = rotation.reprise * 1000
  // Touche M : la grille (gallery/Grille.js)
  Object.assign(
    reglagesGrille,
    useControls('Grille', {
      ...boutonCopier('Grille'),
      colonnes: { value: reglagesGrille.colonnes, min: 1, max: 6, step: 1, label: 'colonnes' },
      ecart: { value: reglagesGrille.ecart, min: 0, max: 160, step: 1, label: 'écart entre les colonnes (px)' },
      ecartLignes: { value: reglagesGrille.ecartLignes, min: 0, max: 160, step: 1, label: 'écart entre les rangées (px)' },
      marge: { value: reglagesGrille.marge, min: 0, max: 240, step: 1, label: 'marges gauche et droite (px)' },
      haut: { value: reglagesGrille.haut, min: 48, max: 320, step: 1, label: 'haut de la grille (px)' },
      duree: { value: reglagesGrille.duree, min: 0.3, max: 5, step: 0.05, label: 'durée du déroulé (s)' },
      decalage: { value: reglagesGrille.decalage, min: 0, max: 0.4, step: 0.005, label: 'décalage d’une carte à la suivante' },
      departAller: { value: reglagesGrille.departAller, min: 0, max: 1, step: 0.01, label: 'vers une salle : départ du zoom (part du rangement en spirale)' },
      departRetour: { value: reglagesGrille.departRetour, min: 0, max: 1, step: 0.01, label: 'retour : départ de la grille (part de la réduction)' },
    }),
  )

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
    // Retour d'une salle en vue Grille (demande de Ludovic, 01/11) : le même retour que sur la
    // spirale (la photo se réduit dans la carte de l'œuvre) ; la spirale se range en grille avant la
    // fin, sans arrêt (`departRetour`), la photo suivant sa carte pendant qu'elle s'y fond
    let retourGrille = store.get().vueAccueil === 'grille' && store.get().transition?.sens === 'sortie'
    // Même couleur de départ que le fond CSS de .accueil ; noir en vue Grille
    const enGrilleAuDepart = store.get().vueAccueil === 'grille' && !retourGrille
    const teinte = new BackgroundTint(fond.current!, enGrilleAuDepart ? NOIR : { r: 24, g: 20, b: 16 })
    if (enGrilleAuDepart) fond.current!.style.backgroundColor = 'rgb(0, 0, 0)'

    // On revient sur l'œuvre quittée (ou la carte centrée au départ de la spirale)
    const derniere = store.get().derniereOeuvre
    let y = derniere ? galerie.offsetForCard(derniere) : 0
    scroll.virtualOffset = y

    // Retour d'une salle : le titre attend, caché, que l'image se fonde dans la carte
    if (store.get().transition) overlay.cacher()

    // Vue Grille (gallery/Grille.js) : les cartes se rangent en grille, qu'on fait défiler
    /** Œuvre ouverte depuis la grille (on y revient) */
    let ouverteGrille: string | null = null
    // Clic sur une vignette (demande de Ludovic, 01/11) : le retour vers la grille à l'envers. La
    // grille se range en spirale, la vignette cliquée en dernier, à la place centrale de la spirale ;
    // le zoom de sa carte part avant la fin (`departAller`), l'image suivant la carte qui finit
    // d'arriver. La transition part au clic, retenue (la salle se prépare pendant le rangement).
    // Le rangement avance avec une horloge bornée (`PAS_MAX`) : la préparation de la salle a
    // quelques images longues (≈ 60 à 80 ms en dev), qui le feraient sauter.
    /** Vers une salle depuis la grille : la grille se range en spirale (vue Grille gardée dans le store) */
    let allerSpirale = false
    const ouvrirDepuisGrille = (id: string) => {
      if (!galerie.carteGrille(id) || galerie.grille.progres < 1 || store.get().transition || !salleOuverte(id)) return
      cliquer()
      const carteCliquee = galerie.carteGrille(id)
      ouverteGrille = id
      grilleQuittee = { oeuvre: id, defilement }
      // La spirale tournée pour que l'œuvre soit au centre ; les cartes de la grille choisies de
      // nouveau à cette place (invisible : la grille est entièrement déroulée)
      y = galerie.offsetForCard(id, y)
      scroll.virtualOffset = y
      galerie.choisirCartesGrille(y)
      // La vidéo du survol revient à l'image de la carte pendant le rangement (demande de Ludovic, 03/11) ;
      // le zoom l'attend (plus bas, `departAller`)
      galerie.revenirEnSpirale(carteCliquee, galerie.carteGrille(id), reduitMouvement() ? 0 : reglagesGrille.departAller * reglagesGrille.duree)
      // Dès le premier dessin de la transition (au clic), son image attend la fin de la vidéo
      carteVivante.video = galerie.videoSurCarte(galerie.carteGrille(id))
      const d = dispositionGrille(toile.current!.clientWidth, toile.current!.clientHeight, cartesSpirale.length)
      galerie.grille.ordre = rangsDepuis(d, cartesSpirale.findIndex((c) => c.id === id))
      deroule?.kill()
      vueGrille = false
      allerSpirale = true
      entrer(id, galerie.cardScreenFrame(galerie.carteGrille(id)), true)
    }
    const legendes = new LegendesGrille({ racine: grille.current!, cartes: cartesSpirale, ouvrir: ouvrirDepuisGrille })
    let vueGrille = enGrilleAuDepart
    let deroule: gsap.core.Tween | null = null
    let defilement = 0
    // Grille défilée comme on l'a quittée (la vignette retrouve sa place), ou jusqu'à l'œuvre quittée
    // (arrivée par un passage)
    const defilementDeRetour = () => {
      const d = dispositionGrille(toile.current!.clientWidth, toile.current!.clientHeight, cartesSpirale.length)
      const c = d.cases[Math.max(0, cartesSpirale.findIndex((x) => x.id === derniere))]
      const voulu = grilleQuittee?.oeuvre === derniere ? grilleQuittee.defilement : c.y + c.h / 2 - toile.current!.clientHeight / 2
      return Math.min(d.defilementMax, Math.max(0, voulu))
    }
    // Arrivée sur l'accueil en vue Grille (hors retour d'une salle) : la grille est déjà en place
    if (vueGrille) {
      galerie.prechargerSurvols()
      galerie.grille.progres = 1
      galerie.choisirCartesGrille(y)
      defilement = galerie.grille.defilement = defilementDeRetour()
      overlay.cacher()
    }
    const changerVue = (grille: boolean) => {
      galerie.finSurvol(true)
      if (grille) galerie.prechargerSurvols()
      vueGrille = grille
      ouverteGrille = null
      allerSpirale = false
      deroule?.kill()
      galerie.grille.ordre = null
      if (grille && galerie.grille.progres === 0) {
        galerie.choisirCartesGrille(y)
        defilement = galerie.grille.defilement = retourGrille ? defilementDeRetour() : 0
        // Retour d'une salle : la carte de l'œuvre part la première vers sa case, la photo avec elle,
        // puis les autres, de la plus proche à la plus éloignée
        if (retourGrille) {
          const d = dispositionGrille(toile.current!.clientWidth, toile.current!.clientHeight, cartesSpirale.length)
          galerie.grille.ordre = rangsDepuis(d, Math.max(0, cartesSpirale.findIndex((x) => x.id === derniere)))
        }
      }
      retourGrille = false
      const cible = grille ? 1 : 0
      const duree = reduitMouvement() ? 0 : reglagesGrille.duree * Math.abs(cible - galerie.grille.progres)
      deroule = gsap.to(galerie.grille, { progres: cible, duration: duree, ease: 'none' })
    }
    const surMolette = (e: WheelEvent) => {
      if (galerie.grille.progres < 1 || store.get().transition) return
      defilement = Math.min(galerie.grille.disposition?.defilementMax ?? 0, Math.max(0, defilement + e.deltaY))
    }
    window.addEventListener('wheel', surMolette, { passive: true })
    // Au doigt (ou souris glissée) : la grille suit ; un clic sans glisser ouvre la vignette touchée
    let appui: { y: number; defilement: number; bouge: boolean } | null = null
    /** Vignette sous la souris, depuis quand (préchargement, comme la carte centrée de la spirale) */
    let survol: { id: string; depuis: number } | null = null
    const surAppui = (e: PointerEvent) => {
      if (galerie.grille.progres > 0 && !store.get().transition) appui = { y: e.clientY, defilement, bouge: false }
    }
    const surDeplacement = (e: PointerEvent) => {
      if (galerie.grille.progres < 1) return
      if (appui && e.buttons) {
        const dy = e.clientY - appui.y
        if (Math.abs(dy) > 6) appui.bouge = true
        if (appui.bouge) defilement = Math.min(galerie.grille.disposition?.defilementMax ?? 0, Math.max(0, appui.defilement - dy))
      }
      const ancre = galerie.pickDragAnchor(e.clientX, e.clientY)
      const i = ancre && galerie.grille.cartes?.get(ancre.slot)
      const id = i !== undefined && i !== null ? cartesSpirale[i].id : null
      toile.current!.style.cursor = id && salleOuverte(id) ? 'pointer' : ''
      if (id !== (survol?.id ?? null)) survol = id ? { id, depuis: performance.now() } : null
      // Vidéo de la vignette survolée à la souris (essai du 03/11 : seule « Le seuil » en a une)
      const video = vueGrille && e.pointerType === 'mouse' && !e.buttons && !store.get().transition && id && salleOuverte(id)
      galerie.survoler(video ? ancre!.slot : null, video ? cartesSpirale[i as number] : null)
    }
    const surSortie = () => galerie.finSurvol()
    const surClic = (e: MouseEvent) => {
      const bouge = appui?.bouge
      appui = null
      if (bouge || galerie.grille.progres < 1) return
      const ancre = galerie.pickDragAnchor(e.clientX, e.clientY)
      const i = ancre && galerie.grille.cartes?.get(ancre.slot)
      if (i !== undefined && i !== null) ouvrirDepuisGrille(cartesSpirale[i].id)
    }
    toile.current!.addEventListener('pointerdown', surAppui)
    toile.current!.addEventListener('pointermove', surDeplacement)
    toile.current!.addEventListener('pointerleave', surSortie)
    toile.current!.addEventListener('click', surClic)

    let raf = 0
    /** Instant où l'on est entré dans la visite (sortie de l'écran d'accueil) */
    let sortieIntro = 0
    /** Instant où l'écran d'accueil est devenu prêt */
    let introPrete = 0
    let centre: { slot: (typeof galerie.slots)[number]; carte: (typeof cartesSpirale)[number] } | null = null
    let centreDepuis = 0
    /** Carte 3D cachée sous l'image de la transition */
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
      if (allerSpirale) {
        const g = galerie.grille
        const duree = reduitMouvement() ? 0 : reglagesGrille.duree
        g.progres = duree ? Math.max(0, g.progres - Math.min(maintenant - avant, PAS_MAX) / 1000 / duree) : 0
        // Le zoom peut partir (Transition.tsx attend en plus que la salle soit prête)
        // (et que la vidéo du survol soit revenue à l'image de la carte)
        if (transition?.retenue && 1 - g.progres >= reglagesGrille.departAller && !galerie.videoSurCarte(galerie.carteGrille(transition.oeuvre)))
          store.set({ transition: { ...transition, retenue: false } })
        // Transition abandonnée (retour arrière) : la grille revient (changerVue)
        if (!transition && g.progres === 0) allerSpirale = false
      }
      avant = maintenant
      // (retour d'une salle vers la grille : la spirale se range en grille quand la photo est presque
      // réduite dans sa carte, `departRetour`)
      const departGrille =
        !transition ||
        (transition.sens === 'sortie' &&
          (transition.phase === 'fondu' || (transition.phase === 'zoom' && carteVivante.zoom >= reglagesGrille.departRetour)))
      if ((store.get().vueAccueil === 'grille') !== vueGrille && !(retourGrille && !departGrille) && !allerSpirale) changerVue(!vueGrille)
      const enGrille = vueGrille || galerie.grille.progres > 0
      if (enGrille) galerie.grille.defilement += (defilement - galerie.grille.defilement) * 0.15
      const versSalle = transition?.sens === 'entree' && (transition.phase === 'preparation' || transition.phase === 'zoom')
      // Entrée : la carte cliquée vient se placer exactement au centre (la même position qu'au retour),
      // l'image de la transition la suit ; sinon, figée pendant une transition
      // (en grille, la carte reste dans sa case)
      if (versSalle && !enGrille) y += (galerie.offsetForCard(transition.oeuvre, y) - y) * 0.15
      else if (centrage) {
        const u = centrage.duree ? Math.min(1, (performance.now() - centrage.debut) / 1000 / centrage.duree) : 1
        y = u < 1 ? centrage.depart + (centrage.cible - centrage.depart) * (u < 0.5 ? 2 * u * u : 1 - (2 - 2 * u) ** 2 / 2) : centrage.cible
        scroll.virtualOffset = centrage.cible // molette et glisser ignorés le temps du centrage
      } else if (!transition && !enGrille) y += (scroll.tick() - y) * CONFIG.rotationLerp
      if (transition || enGrille) scroll.virtualOffset = y
      galerie.update(y)
      legendes.placer(galerie.grille.disposition, galerie.grille.defilement, galerie.grille.progres, galerie.grille.ordre)
      const centree = getCenteredSlot(galerie.slots, galerie.camera)
      // La carte de la transition : en grille, celle de l'œuvre ouverte (ou quittée), dans sa case
      const slot = (enGrille && transition && galerie.carteGrille(transition.oeuvre)) || centree
      const carte = cartesSpirale[slot.index % cartesSpirale.length]
      // Retour vers la grille : la photo suit sa carte, qui part déjà vers sa case
      const versGrille = enGrille && transition?.sens === 'sortie' && (transition.phase === 'zoom' || transition.phase === 'fondu')
      if (versSalle || versGrille) carteVivante.cadre = galerie.cardScreenFrame(slot)
      // Sous l'image de la transition, la carte 3D est cachée : elle grandirait avec la spirale sans
      // avoir tout à fait la forme de l'image, et ses bords dépasseraient. On la revoit au fondu du retour.
      // Tant que la vidéo du survol y revient à sa première image, c'est elle qu'on voit : la carte reste
      // visible et l'image de la transition attend (Transition.tsx, carteVivante.video)
      carteVivante.video = transition?.sens === 'entree' && galerie.videoSurCarte(slot)
      // À l'entrée, la carte n'est cachée qu'une fois l'image de la transition dessinée par-dessus
      // (transition.ts, `dessinee`)
      const aCacher =
        transition &&
        !(transition.sens === 'sortie' && transition.phase === 'fondu') &&
        imagePrete(carte.imageTransition) &&
        !carteVivante.video &&
        (transition.sens !== 'entree' || carteVivante.dessinee)
          ? slot
          : null
      // (galerie.update la garde cachée aux images suivantes ; cette image-ci est déjà placée)
      galerie.carteCachee = aCacher
      if (aCacher) aCacher.mesh.visible = false
      if (carte.id !== centre?.carte.id) centreDepuis = performance.now()
      else if (!enGrille && performance.now() - centreDepuis > DELAI_PRECHARGEMENT && peutPrecharger()) prechargerOeuvre(carte.id)
      if (vueGrille && survol && maintenant - survol.depuis > DELAI_SURVOL && peutPrecharger()) prechargerOeuvre(survol.id)
      centre = { slot, carte }
      // Titre de la carte : il part lettre par lettre au clic sur « Découvrir », et revient de même
      // au retour d'une salle, quand l'image se fond dans la carte
      if (store.get().intro === 'sortie') sortieIntro ||= maintenant
      if (store.get().intro === 'pret') introPrete ||= maintenant
      const titreAttend = enIntro() || (store.get().intro === 'sortie' && maintenant - sortieIntro < TITRE_APRES_INTRO)
      if ((transition && !(transition.sens === 'sortie' && transition.phase === 'fondu')) || titreAttend || enGrille || retourGrille) overlay.cacher()
      else overlay.montrer()
      if (accueil) avancer('spirale-images', galerie.slots.filter((s) => s.texture).length / galerie.slots.length)
      overlay.setCard(enGrille ? cartesSpirale[centree.index % cartesSpirale.length] : carte)
      // Fond : la couleur de la carte centrée sur la spirale, noir en vue Grille (demande de Ludovic, 01/11)
      if (vueGrille) teinte.setCard(FOND_GRILLE, NOIR)
      else teinte.setCard(carte, galerie.cardColors.get(carte.id))
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
      if (!centre || centrage || store.get().transition || !centre.carte.ouverte) return
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
      if (ouverteGrille) store.set({ derniereOeuvre: ouverteGrille })
      else if (centre) store.set({ derniereOeuvre: centre.carte.id })
      deroule?.kill()
      legendes.dispose()
      window.removeEventListener('wheel', surMolette)
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
      className={`accueil ${transition ? 'accueil--transition' : ''} ${vue === 'grille' ? 'accueil--grille' : ''} ${
        transition?.sens === 'sortie' && (transition.phase === 'retour' || transition.phase === 'photo') ? 'accueil--cachee' : ''
      }`}
      ref={fond}
    >
      <div className="accueil__toile" ref={toile} />
      {/* Vue Grille : titres et étiquettes sous les vignettes, écrits par gallery/Grille.js */}
      <div className="grille" ref={grille} />

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
                onClick={() => store.set({ vueAccueil: v })}
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

      {/* Vue Grille : recherche et filtres en bas de l'écran (maquette Figma « SearchBar » 58:455) ;
          pas encore reliés à la grille */}
      <div className="recherche" ref={recherche} inert={vue !== 'grille'}>
        <span className="masque masque--champ">
          <label className="recherche__champ">
            <input className="recherche__saisie" type="search" placeholder="Rechercher" aria-label="Rechercher une œuvre" />
            <span className="recherche__icone">
              <MagnifyingGlassIcon size={16} aria-hidden />
            </span>
          </label>
        </span>
        {['Tags', 'Mécènes'].map((nom) => (
          <span key={nom} className="masque">
            <button type="button" className="recherche__filtre">
              {nom}
              <span className="recherche__icone">
                <CaretDownIcon size={12} aria-hidden />
              </span>
            </button>
          </span>
        ))}
      </div>

      {/* Chaque bouton dans son masque, d'où il sort par le haut et où il entre par le bas */}
      <div className="accueil__fleches" ref={fleches} inert={vue === 'grille'}>
        <span className="masque">
          <button type="button" className="bouton-rond" aria-label="Carte précédente" onClick={() => defiler.current(-1)}>
            <IconeFleche />
          </button>
        </span>
        <span className="masque">
          <button type="button" className="bouton-rond" aria-label="Carte suivante" onClick={() => defiler.current(1)}>
            <IconeFleche suivant />
          </button>
        </span>
      </div>
    </div>
  )
}
