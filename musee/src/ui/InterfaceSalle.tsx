import { useCallback, useEffect, useLayoutEffect, useRef, useState, type TouchEvent } from 'react'
import { Link } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import { nouvelleCle, store, useEtat, type Sens } from '../store'
import { lienOeuvre, oeuvres, salleOuverte, type Oeuvre, type Onglet } from '../oeuvres'
import { EnTete } from './EnTete'
import { IconeCroix, IconeFleche, IconePartage } from './icones'
import { Popup, PopupChiffres, PopupEntete, PopupLien, PopupTexte } from './Popup'
import { sortir } from '../transition'
import { cliquer } from '../musique'
import { avancer } from '../chargement'
import { useApparition } from './apparition'


/** Affiche le premier écran ou un popup, et envoie la caméra vers le point de vue associé (voir Oeuvre.vues). */
export function choisirOnglet(oeuvre: Oeuvre, onglet: Onglet) {
  if (onglet !== 'info' && store.get().onglet !== onglet) cliquer()
  const vue = oeuvre.vues[onglet]
  const i = vue ? oeuvre.salle.etapes.findIndex((e) => e.id === vue) : -1
  store.set({ onglet, demande: i >= 0 ? i : 'cercle' })
}

/** Part vers la salle d'une autre œuvre, par la porte et le couloir (voir scene/passage.ts). */
function partirVers(oeuvre: Oeuvre, sens: Sens) {
  if (store.get().passage) return
  cliquer()
  store.set({ onglet: 'info', passage: { cle: nouvelleCle(), oeuvre: oeuvre.id, sens } })
}

/**
 * Interface d'une salle, d'après la maquette Figma (premier écran 477:973, popups 447:602
 * et 448:911) : header avec le titre de l'œuvre (retour à la collection), premier écran à
 * gauche (titre, cartouches Maladie et Manifeste, soutien, partage), popups Maladie et
 * Manifeste à droite, en bas flèches œuvre précédente / suivante (qui s'ouvrent en carte au survol).
 */
export function InterfaceSalle({ oeuvre }: { oeuvre: Oeuvre }) {
  const onglet = useEtat((e) => e.onglet)
  const enPassage = useEtat((e) => !!e.passage)
  // Transition avec la spirale : en entrant, le premier écran apparaît quand l'image de la carte
  // s'efface ; en sortant, il disparaît dès que la caméra repart vers la vue initiale.
  // Titre lettre par lettre et liens en fondu, comme le titre de la spirale.
  const enTransition = useEtat(
    (e) =>
      (!!e.transition && !(e.transition.sens === 'entree' && e.transition.phase === 'fondu')) ||
      e.intro === 'chargement' ||
      e.intro === 'pret', // arrivée directe : le premier écran apparaît à l'entrée dans la visite
  )
  const ouvert = onglet !== 'info'
  // Popup en train de se fermer (ouvert au rendu précédent)
  const etaitOuvert = useRef(ouvert)
  const popupFerme = useRef(false)
  if (etaitOuvert.current !== ouvert) {
    popupFerme.current = etaitOuvert.current
    etaitOuvert.current = ouvert
  }
  const premierEcran = useRef<HTMLElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)
  useApparition({
    conteneur: premierEcran,
    titre,
    texte: oeuvre.titre,
    autres: '.cartouche, .salle-accueil__bas > *',
    // Vers l'œuvre précédente / suivante ou à l'ouverture d'un popup : il part dès le clic,
    // élément par élément ; il revient à l'arrivée dans la salle suivante ou à la fermeture
    visible: !enTransition && !enPassage && !ouvert,
    cascade: enPassage || ouvert,
    // À la fermeture d'un popup, on attend que son contenu soit parti
    delai: popupFerme.current ? 0.35 : 0,
  })
  useEffect(() => {
    popupFerme.current = false // une seule fois, à la fermeture
  })

  // Mobile (maquette 520:1179) : premier écran en panneau du bas, replié sur le titre ; on le déplie
  // en touchant la poignée ou le titre, ou en le faisant glisser : il suit le doigt, comme une feuille
  // d'iOS, puis se cale ouvert ou fermé selon sa position et la vitesse du geste
  const [deplie, setDeplie] = useState(false)
  const surMobile = () => window.matchMedia('(max-width: 760px)').matches
  if (ouvert && deplie) setDeplie(false)
  const feuille = useFeuille(premierEcran, deplie, setDeplie, surMobile, oeuvre.id)

  // Le popup garde son contenu pendant qu'il disparaît
  const [contenu, setContenu] = useState<'maladie' | 'manifeste'>('maladie')
  if (ouvert && onglet !== contenu) setContenu(onglet)

  const fermerPopup = useCallback(() => choisirOnglet(oeuvre, 'info'), [oeuvre])

  const i = oeuvres.indexOf(oeuvre)
  const precedente = oeuvres[(i - 1 + oeuvres.length) % oeuvres.length]
  const suivante = oeuvres[(i + 1) % oeuvres.length]

  // Nouvelle œuvre : on repart du premier écran et du tour libre
  useEffect(() => {
    store.set({ onglet: 'info', demande: 'cercle' })
    setDeplie(false)
  }, [oeuvre.id])

  useEffect(() => {
    const clavier = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') store.set({ menu: false })
    }
    window.addEventListener('keydown', clavier)
    return () => {
      window.removeEventListener('keydown', clavier)
    }
  }, [])

  return (
    <div className={`salle-ui ${enPassage ? 'salle-ui--passage' : ''} ${enTransition ? 'salle-ui--transition' : ''} ${ouvert ? 'salle-ui--popup' : ''}`}>
      <div className="salle-ui__vignette" aria-hidden />
      {/* Mobile : voile noir en haut et en bas de l'écran (maquette 520:1179) */}
      <div className="salle-ui__degrade" aria-hidden />
      <Chargement />

      <EnTete
        centre={
          <Link
            to="/"
            className="pilule pilule--titre"
            aria-label={`${oeuvre.titre} : retour à la collection`}
            onClick={(e) => {
              cliquer()
              if (sortir()) e.preventDefault()
            }}
          >
            <span className="pilule__texte">{oeuvre.titre}</span>
            <span className="pilule__icone"><IconeCroix /></span>
          </Link>
        }
      />

      {/* Premier écran : on ouvre les popups depuis ses cartouches Maladie et Manifeste */}
      <section
        ref={premierEcran}
        className={`salle-accueil ${ouvert ? 'salle-accueil--cache' : ''} ${deplie ? 'salle-accueil--deplie' : ''}`}
        inert={ouvert || enTransition || enPassage}
        aria-label={oeuvre.titre}
        onTouchStart={feuille.debut}
        onTouchMove={feuille.mouvement}
        onTouchEnd={feuille.fin}
        onTouchCancel={feuille.fin}
      >
        {/* Mobile seulement (masquée sur ordinateur) */}
        <button
          type="button"
          className="salle-accueil__poignee"
          aria-expanded={deplie}
          aria-label={deplie ? 'Replier la présentation' : 'Déplier la présentation'}
          onClick={() => setDeplie(!deplie)}
        />
        <div className="salle-accueil__haut">
          {/* Écrit et découpé en lettres par useApparition */}
          <h1 className="salle-accueil__titre" ref={titre} onClick={() => surMobile() && setDeplie(!deplie)} />
          <div className="salle-accueil__cartouches">
            <Cartouche
              oeuvre={oeuvre}
              onglet="maladie"
              libelle="Maladie"
              titre={oeuvre.maladie || 'À venir'}
            />
            <Cartouche oeuvre={oeuvre} onglet="manifeste" libelle="Manifeste" titre={oeuvre.manifesteTitre} />
          </div>
        </div>

        <div className="salle-accueil__bas">
          <Soutien oeuvre={oeuvre} />
          <Partager oeuvre={oeuvre} />
        </div>
      </section>

      <Popup ouvert={ouvert} onFermer={fermerPopup} etiquette={contenu === 'maladie' ? 'La maladie' : 'Manifeste'}>
        {contenu === 'maladie' ? <Maladie oeuvre={oeuvre} /> : <Manifeste oeuvre={oeuvre} />}
      </Popup>

      <nav className="pied" aria-label="Navigation dans la collection">
        <Fleche oeuvre={precedente} sens="precedente" desactivee={enPassage} />
        {/* Mobile : retour à la collection entre les flèches (maquette 520:1179), à la place du titre du header */}
        <Link
          to="/"
          className="bouton-rond pied__retour"
          aria-label={`${oeuvre.titre} : retour à la collection`}
          onClick={(e) => {
            cliquer()
            if (sortir()) e.preventDefault()
          }}
        >
          <IconeCroix />
        </Link>
        <Fleche oeuvre={suivante} sens="suivante" desactivee={enPassage} />
      </nav>
    </div>
  )
}

/**
 * Mobile : le panneau du bas suit le doigt (feuille d'iOS). Son ouverture (0 replié, 1 déplié) est la
 * variable CSS --feuille, qui règle la hauteur des blocs repliables (style.css, section Mobile) ;
 * pendant le geste elle suit le doigt au pixel près (hauteurs mesurées : --h-cartouches, --h-bas),
 * puis elle rejoint 0 ou 1 en transition. Un geste rapide l'emporte sur la position.
 */
const ECART_BLOCS = 16 // marge au-dessus des cartouches et du bas, déplié (style.css)
function useFeuille(
  section: React.RefObject<HTMLElement | null>,
  deplie: boolean,
  setDeplie: (d: boolean) => void,
  surMobile: () => boolean,
  cle: string,
) {
  const geste = useRef<{ y0: number; o0: number; o: number; course: number; y: number; t: number; vitesse: number; actif: boolean } | null>(null)
  const mesurer = () => {
    const el = section.current
    if (!el) return 1
    const c = el.querySelector<HTMLElement>('.salle-accueil__cartouches')
    const b = el.querySelector<HTMLElement>('.salle-accueil__bas')
    // Hauteurs de mise en page (offsetHeight), sans les décalages des animations d'apparition
    // (transform), que scrollHeight compterait
    const enfants = (x: HTMLElement | null) => (x ? [...x.children].map((n) => (n as HTMLElement).offsetHeight) : [])
    const hc = Math.max(0, ...enfants(c))
    const lb = enfants(b)
    const hb = lb.reduce((a, h) => a + h, 0) + ECART_BLOCS * Math.max(0, lb.length - 1)
    el.style.setProperty('--h-cartouches', `${hc}px`)
    el.style.setProperty('--h-bas', `${hb}px`)
    return Math.max(1, 2 * ECART_BLOCS + hc + hb)
  }
  useLayoutEffect(() => {
    mesurer()
    window.addEventListener('resize', mesurer)
    return () => window.removeEventListener('resize', mesurer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cle])
  const debut = (e: TouchEvent) => {
    if (!surMobile()) return
    const y = e.touches[0].clientY
    const o = deplie ? 1 : 0
    geste.current = { y0: y, o0: o, o, course: mesurer(), y, t: e.timeStamp, vitesse: 0, actif: false }
  }
  const mouvement = (e: TouchEvent) => {
    const g = geste.current
    const el = section.current
    if (!g || !el) return
    const y = e.touches[0].clientY
    const dy = y - g.y0
    if (!g.actif) {
      if (Math.abs(dy) < 6) return
      // Déplié et défilé (petits écrans) : le geste fait défiler le contenu
      if (deplie && el.scrollTop > 0) return void (geste.current = null)
      g.actif = true
      el.classList.add('salle-accueil--glisse')
    }
    g.o = Math.min(1, Math.max(0, g.o0 - dy / g.course))
    el.style.setProperty('--feuille', String(g.o))
    // Vitesse (px/ms, vers le bas positive), amortie
    const dt = Math.max(1, e.timeStamp - g.t)
    g.vitesse = 0.7 * ((y - g.y) / dt) + 0.3 * g.vitesse
    g.y = y
    g.t = e.timeStamp
  }
  const fin = () => {
    const g = geste.current
    const el = section.current
    geste.current = null
    if (!g?.actif || !el) return
    const ouvrir = g.vitesse < -0.35 ? true : g.vitesse > 0.35 ? false : g.o > 0.5
    // La transition reprend là où le doigt a laissé le panneau
    el.classList.remove('salle-accueil--glisse')
    void el.offsetHeight
    el.style.setProperty('--feuille', ouvrir ? '1' : '0')
    setDeplie(ouvrir)
    setTimeout(() => el.style.removeProperty('--feuille'), 0)
  }
  return { debut, mouvement, fin }
}

/**
 * Flèche œuvre précédente ou suivante, en bas : un rond ; au survol, il s'ouvre en carte
 * (maquette 477:973) avec le visuel de l'œuvre, la flèche se décale et le libellé apparaît.
 * Lance le passage par le couloir.
 */
function Fleche({ oeuvre, sens, desactivee }: { oeuvre: Oeuvre; sens: Sens; desactivee: boolean }) {
  // Salle fermée à la visite (oeuvres.ts) : la flèche reste, désactivée et estompée
  const fermee = !salleOuverte(oeuvre.id)
  return (
    <button
      type="button"
      className={`fleche fleche--${sens}${fermee ? ' fleche--fermee' : ''}`}
      disabled={desactivee || fermee}
      onClick={() => partirVers(oeuvre, sens)}
    >
      <img className="fleche__image" src={oeuvre.vignetteVue ?? oeuvre.vignette ?? oeuvre.image} alt="" />
      <span className="fleche__libelle">
        <span className="fleche__texte">{sens === 'suivante' ? 'Œuvre suivante' : 'Œuvre précédente'}</span>
        <IconeFleche suivant={sens === 'suivante'} />
      </span>
    </button>
  )
}

/**
 * Cartouche du premier écran (maquette 477:973) : photo, libellé et titre (nom de la maladie,
 * titre du manifeste). Ouvre le popup et envoie la caméra vers son point de vue.
 */
function Cartouche({ oeuvre, onglet, libelle, titre }: { oeuvre: Oeuvre; onglet: 'maladie' | 'manifeste'; libelle: string; titre?: string }) {
  return (
    <button type="button" className={`cartouche cartouche--${onglet}`} onClick={() => choisirOnglet(oeuvre, onglet)}>
      <img className="cartouche__photo" src={oeuvre.cartouches?.[onglet] ?? oeuvre.image} alt="" />
      <span className="cartouche__texte">
        <span className="cartouche__libelle">{libelle}</span>
        {titre && <span className="cartouche__titre">{titre}</span>}
      </span>
    </button>
  )
}

/** « Avec le soutien de » : logo du partenaire, à défaut le nom du partenaire ou du mécène. */
function Soutien({ oeuvre }: { oeuvre: Oeuvre }) {
  const { partenaire, mecene } = oeuvre
  if (!partenaire && !mecene) return null
  return (
    <div className="soutien">
      <p className="soutien__libelle">Avec le soutien de</p>
      {partenaire?.logo ? (
        <img className="soutien__logo" src={partenaire.logo} alt={partenaire.nom} />
      ) : (
        <p className="soutien__nom">{partenaire?.nom ?? mecene!.nom}</p>
      )}
    </div>
  )
}

/** Popup Maladie (maquette 502:770) */
function Maladie({ oeuvre }: { oeuvre: Oeuvre }) {
  const t = oeuvre.maladieTexte
  return (
    <>
      <PopupEntete surtitre="La maladie" titre={t.titre} />
      <PopupTexte paragraphes={t.paragraphes} />
      {!!t.chiffres?.length && <PopupChiffres chiffres={t.chiffres} />}
      {t.lien !== undefined && <PopupLien href={t.lien ?? undefined}>En savoir plus</PopupLien>}
    </>
  )
}

/** Popup Manifeste (maquette 477:2158) */
function Manifeste({ oeuvre }: { oeuvre: Oeuvre }) {
  return (
    <>
      <PopupEntete surtitre="Manifeste" titre={oeuvre.manifesteTitre} />
      <PopupTexte paragraphes={oeuvre.manifeste} petit />
    </>
  )
}

/** Partage natif (mobile) ou copie du lien dans le presse-papiers. */
function Partager({ oeuvre }: { oeuvre: Oeuvre }) {
  const [copie, setCopie] = useState(false)
  const partager = async () => {
    const url = new URL(lienOeuvre(oeuvre), window.location.origin).href
    try {
      if (navigator.share) {
        await navigator.share({ title: `${oeuvre.titre} — Musée des Maladies Rares`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setCopie(true)
      setTimeout(() => setCopie(false), 2000)
    } catch {
      /* partage annulé */
    }
  }
  return (
    <button type="button" className="pilule pilule--partage" onClick={partager}>
      <IconePartage />
      <span aria-live="polite">{copie ? 'Lien copié' : 'Partager cette œuvre'}</span>
    </button>
  )
}

function Chargement() {
  const { active, progress } = useProgress()
  const [fini, setFini] = useState(false)
  // Arrivée directe par l'adresse : l'écran d'accueil (ui/Intro.tsx) montre le chargement de la salle
  const [sousIntro] = useState(() => store.get().intro !== null)
  const affichee = useEtat((e) => e.salleAffichee !== null)
  useEffect(() => {
    if (sousIntro) avancer('salle', affichee ? 1 : (progress / 100) * 0.9)
  }, [sousIntro, affichee, progress])
  // En entrant depuis la spirale, l'image de la carte sert d'écran d'attente : la barre seule
  const [discret] = useState(() => store.get().transition?.sens === 'entree')
  useEffect(() => {
    if (!active && progress === 100) {
      const t = setTimeout(() => setFini(true), 400)
      return () => clearTimeout(t)
    }
  }, [active, progress])
  if (fini || sousIntro) return null
  return (
    <div className={`chargement ${discret ? 'chargement--discret' : ''} ${!active && progress === 100 ? 'chargement--fin' : ''}`}>
      {!discret && <img className="chargement__logo" src="/assets/logo-mmr.png" alt="Musée des Maladies Rares" />}
      <div className="chargement__barre"><span style={{ width: `${progress}%` }} /></div>
    </div>
  )
}
