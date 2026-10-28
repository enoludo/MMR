import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import gsap from 'gsap'
import { useControls } from 'leva'
import { lienOeuvre, oeuvres } from '../oeuvres'
import { store, useEtat, type Cadre, type Transition as EtatTransition } from '../store'
import { captureSalle, carteVivante } from '../transition'
import { RECUL, ZOOM_CARTE, avancee, champEntree, durees, entree, partVisible, temps } from '../entree'
import { obtenirToile, reglagesCapture } from './ToileTransition'

/** Au-delà, on montre la salle même si elle n'a pas signalé être prête (ms) */
const ATTENTE_MAX = 20000
/** Au-delà, le zoom commence même si la salle n'est pas encore préparée (ms) */
const PREPARATION_MAX = 2500

const reduitMouvement = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const pleinEcran = (): Cadre => ({
  x: window.innerWidth / 2,
  y: window.innerHeight / 2,
  largeur: window.innerWidth,
  hauteur: window.innerHeight,
  angle: 0,
})
const entre = (a: Cadre, b: Cadre, t: number): Cadre => {
  const m = gsap.utils.interpolate
  return { x: m(a.x, b.x, t), y: m(a.y, b.y, t), largeur: m(a.largeur, b.largeur, t), hauteur: m(a.hauteur, b.hauteur, t), angle: m(a.angle, b.angle, t) }
}
const lisse = (a: number, b: number, t: number) => {
  const u = Math.min(1, Math.max(0, (t - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/**
 * La spirale suit la boîte : la carte reste sous l'image, toute la spirale grandit (ou
 * rétrécit) avec elle. Échelle de l'image dans la boîte (elle la couvre) : celle de la spirale.
 */
function suivreSpirale(toile: HTMLElement, carte: Cadre, boite: Cadre, format: number) {
  const echelle = (c: Cadre) => Math.max(c.hauteur, c.largeur / format)
  toile.style.transformOrigin = '0 0'
  toile.style.transform =
    `translate(${boite.x}px, ${boite.y}px) rotate(${boite.angle - carte.angle}rad) ` +
    `scale(${echelle(boite) / echelle(carte)}) translate(${-carte.x}px, ${-carte.y}px)`
}

/**
 * Transitions entre la spirale et les salles (démarrées par transition.ts) :
 * - entrée : l'image de la carte cliquée (pour « Le seuil des proportions », une capture de
 *   sa salle) se pose sur elle et grandit jusqu'à remplir l'écran, toute la spirale avec elle ;
 *   dans l'image, on avance déjà (parallaxe, voir ToileTransition et entree.ts) ; on change de
 *   page dessous ; dès que la salle est dessinée, l'image s'efface sur elle, la caméra de la
 *   salle poursuivant le même mouvement jusqu'à la vue d'arrivée ;
 * - sortie : la caméra de la salle rejoint la vue initiale, d'où l'on prend une photo, qui couvre l'écran ; on change de page dessous ; la spirale
 *   revient sur l'œuvre et donne la place de sa carte ; la photo s'y réduit, avec toute la
 *   spirale, en se fondant dans l'image de l'œuvre (qui recule de la vue d'arrivée à celle de
 *   la carte, parallaxe inverse), puis laisse voir la vraie carte.
 * Non interruptible : molette et clavier sont ignorés le temps de la transition.
 */
export function Transition() {
  const transition = useEtat((e) => e.transition)
  // Gardée dans une référence : sa valeur change avec l'adresse, et le déroulé ne doit pas repartir
  const naviguerVers = useNavigate()
  const naviguer = useRef(naviguerVers)
  naviguer.current = naviguerVers
  // Durées (touche M) : la carte remplit l'écran ou s'y réduit, l'image s'efface, mouvement d'entrée
  const reglages = useControls('Transitions', {
    zoomEntree: { value: durees.zoomEntree, min: 0.3, max: 4, step: 0.05, label: 'entrée : zoom de la carte (s)' },
    fonduEntree: { value: durees.fonduEntree, min: 0.2, max: 3, step: 0.05, label: 'entrée : fondu sur la salle (s)' },
    monteeImage: { value: durees.monteeImage, min: 0.5, max: 4, step: 0.05, label: 'entrée : avancée dans l’image (s)' },
    finSalle: { value: durees.finSalle, min: 0.5, max: 5, step: 0.05, label: 'entrée : fin dans la salle (s)' },
    zoomSortie: { value: durees.zoomSortie, min: 0.3, max: 4, step: 0.05, label: 'retour : réduction (s)' },
    fonduSortie: { value: durees.fonduSortie, min: 0.1, max: 2, step: 0.05, label: 'retour : fondu sur la carte (s)' },
  })
  Object.assign(durees, reglages)
  const conteneur = useRef<HTMLDivElement>(null)
  /** Valeurs animées par GSAP, lues à chaque image : avancement du zoom (adouci) et opacité */
  const anim = useRef({ zoom: 0, opacite: 1 })
  const oeuvre = oeuvres.find((o) => o.id === transition?.oeuvre)
  const { pathname } = useLocation()

  // Retour arrière du navigateur pendant une transition : l'adresse n'est plus celle attendue, on l'abandonne
  useEffect(() => {
    const t = store.get().transition
    if (!t) return
    const o = oeuvres.find((x) => x.id === t.oeuvre)
    // On navigue vers la salle dès le début du zoom (elle se prépare dessous), vers la spirale après la photo
    const dansLaSalle = t.sens === 'entree' || t.phase === 'retour' || t.phase === 'photo'
    const attendue = dansLaSalle && o ? lienOeuvre(o) : '/'
    if (pathname !== attendue) {
      entree.debut = entree.relais = null
      entree.enAttente = false
      store.set({ transition: null })
    }
  }, [pathname])

  // Déroulé : une étape par phase
  useLayoutEffect(() => {
    const t = store.get().transition
    if (!t || !oeuvre) return
    const vite = reduitMouvement() ? 0 : 1
    const a = anim.current
    const suite = (partiel: Partial<EtatTransition> | null) => {
      const actuelle = store.get().transition
      if (actuelle === t) store.set({ transition: partiel && { ...actuelle, ...partiel } })
    }

    if (t.phase === 'preparation') {
      // La salle se monte et se prépare sous la spirale (main.tsx, PageOeuvre, Experience) pendant
      // que le titre s'efface : les à-coups du navigateur tombent avant le zoom, pas pendant
      a.zoom = 0
      a.opacite = 1
      entree.debut = vite ? temps() : null
      entree.relais = null
      entree.enAttente = true
      naviguer.current(lienOeuvre(oeuvre))
      let fait = false
      const lancer = () => {
        if (fait) return
        fait = true
        suite({ phase: 'zoom' })
      }
      const verifier = () => {
        const { salle, sallePrete } = store.get()
        if (salle && salle.cle === sallePrete) lancer()
      }
      const desabonner = store.subscribe(verifier)
      const secours = setTimeout(lancer, PREPARATION_MAX)
      return () => {
        desabonner()
        clearTimeout(secours)
      }
    }

    if (t.phase === 'zoom') {
      a.zoom = 0
      a.opacite = 1
      if (t.sens === 'entree') {
        // L'avancée dans l'image part du début du zoom (sans mouvement : directement à la vue d'arrivée)
        entree.debut = vite ? temps() : null
        entree.enAttente = false
      }
      const tween = gsap.to(a, {
        zoom: 1,
        duration: (t.sens === 'entree' ? durees.zoomEntree : durees.zoomSortie) * vite,
        // Au retour, la réduction démarre plus franchement : la caméra vient de s'arrêter à la vue initiale
        ease: t.sens === 'entree' ? 'power3.inOut' : 'power2.inOut',
        onComplete: () => suite({ phase: t.sens === 'entree' ? 'attente' : 'fondu' }),
      })
      return () => {
        tween.kill()
      }
    }

    if (t.phase === 'attente' && t.sens === 'entree') {
      // La salle se charge sous l'image, la caméra déjà au même point de l'avancée : on attend qu'elle soit dessinée
      let fait = false
      const relayer = () => {
        if (fait) return
        fait = true
        if (entree.debut !== null) entree.relais = temps()
        suite({ phase: 'fondu' })
      }
      const verifier = () => {
        const { salle, salleAffichee } = store.get()
        if (salle && salle.cle === salleAffichee) relayer()
      }
      const desabonner = store.subscribe(verifier)
      const secours = setTimeout(relayer, ATTENTE_MAX)
      verifier()
      return () => {
        desabonner()
        clearTimeout(secours)
      }
    }

    if (t.phase === 'retour') {
      // La caméra rejoint la vue initiale (Navigation, mode « sortie ») ; par sécurité, on n'attend pas plus de 4 s
      const secours = setTimeout(() => suite({ phase: 'photo' }), 4000)
      return () => clearTimeout(secours)
    }

    if (t.phase === 'photo') {
      // Une image plus tard, pour que le reflet ait suivi la caméra arrivée
      const raf = requestAnimationFrame(() => {
        suite({ phase: 'attente', image: captureSalle.courante?.() ?? null })
        naviguer.current('/')
      })
      return () => cancelAnimationFrame(raf)
    }

    if (t.phase === 'attente' && t.sens === 'sortie') {
      a.zoom = 0
      a.opacite = 1
      entree.debut = entree.relais = null
      entree.enAttente = false
      return
    }

    if (t.phase === 'fondu') {
      const tween = gsap.to(a, {
        opacite: 0,
        duration: (t.sens === 'entree' ? durees.fonduEntree : durees.fonduSortie) * vite,
        ease: 'power1.inOut',
        onComplete: () => suite(null),
      })
      return () => {
        tween.kill()
      }
    }
  }, [transition?.sens, transition?.phase, oeuvre])

  // Une image par image d'écran, tant que la transition dure
  const active = !!transition
  useEffect(() => {
    if (!active) return
    const t0 = obtenirToile()
    conteneur.current?.appendChild(t0.canvas)
    let spirale: HTMLElement | null = null

    const rendre = () => {
      const t = store.get().transition
      const o = oeuvres.find((x) => x.id === t?.oeuvre)
      if (!t || !o) return
      if (t.phase === 'retour' || t.phase === 'photo') return t0.effacer()
      const a = anim.current
      const plein = pleinEcran()
      // Entrée : la carte cliquée, que la spirale recentre (carteVivante)
      const carte = t.sens === 'entree' ? (carteVivante.cadre ?? t.carte) : t.carte
      const boite = !carte ? plein : t.sens === 'entree' ? entre(carte, plein, a.zoom) : entre(plein, carte, a.zoom)

      const r = reglagesCapture(o.vueEntree)
      spirale = document.querySelector<HTMLElement>('.accueil__toile')
      if (spirale && carte) suivreSpirale(spirale, carte, boite, r.format)

      // Avancée dans l'image : à l'entrée, celle que la salle reprendra ; à la sortie, on recule
      // de la vue d'arrivée (celle de la photo, si l'on n'a pas bougé) jusqu'à la vue de la carte
      const u = t.sens === 'entree' ? avancee() : 1 - a.zoom
      // Champ du contenu : celui de la salle à la même avancée, ramené à l'image entière
      const format = plein.largeur / plein.hauteur
      const champSalle = (champEntree(u, r.focale, format) * Math.PI) / 180
      const champ = ((2 * Math.atan(Math.tan(champSalle / 2) / partVisible(format))) * 180) / Math.PI
      t0.dessiner({
        boite,
        image: o.image,
        vueEntree: o.vueEntree,
        avance: RECUL * u,
        champ,
        // Effet de masque : la capture, agrandie dans sa carte, revient à 1 quand la boîte occupe l'écran
        zoom: o.vueEntree ? 1 + (ZOOM_CARTE - 1) * (t.sens === 'entree' ? 1 - a.zoom : a.zoom) : 1,
        photo: t.sens === 'sortie' ? t.image : null,
        // Sortie : la photo de la salle se fond dans l'image de l'œuvre pendant qu'elle se réduit
        melange: t.sens === 'sortie' ? 1 - lisse(0.15, 0.75, a.zoom) : 0,
        // La vignette sombre de la salle (absente des captures et de la photo) s'installe à mesure
        // que la carte gagne l'écran, et s'en va pendant qu'elle s'y réduit : ni saut, ni voile sur la carte
        vignette: t.sens === 'entree' ? lisse(0.3, 1, a.zoom) : 1 - lisse(0, 0.7, a.zoom),
        // De même, l'image prend l'éclairage de la carte de la spirale (plus sombre) quand elle est
        // à sa place, et le perd en gagnant l'écran : pas de voile qui saute au clic ni au fondu
        eclairage: gsap.utils.interpolate(
          carte?.eclairage ?? 1,
          1,
          t.sens === 'entree' ? lisse(0, 0.7, a.zoom) : 1 - lisse(0.3, 1, a.zoom),
        ),
        opacite: a.opacite,
      })
    }
    rendre()
    gsap.ticker.add(rendre)

    // Non interruptible : ni molette (spirale, salle), ni clavier
    const bloquer = (e: Event) => {
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('wheel', bloquer, { capture: true, passive: false })
    window.addEventListener('keydown', bloquer, { capture: true })
    return () => {
      gsap.ticker.remove(rendre)
      t0.effacer()
      carteVivante.cadre = null
      if (spirale) spirale.style.transform = ''
      window.removeEventListener('wheel', bloquer, { capture: true })
      window.removeEventListener('keydown', bloquer, { capture: true })
    }
  }, [active])

  return <div className="transition" ref={conteneur} hidden={!transition} aria-hidden />
}
