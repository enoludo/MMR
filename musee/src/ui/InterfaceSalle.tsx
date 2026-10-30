import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import { nouvelleCle, store, useEtat, type Sens } from '../store'
import { lienOeuvre, oeuvres, type Oeuvre, type Onglet } from '../oeuvres'
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
    <div className={`salle-ui ${enPassage ? 'salle-ui--passage' : ''} ${enTransition ? 'salle-ui--transition' : ''}`}>
      <div className="salle-ui__vignette" aria-hidden />
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
        className={`salle-accueil ${ouvert ? 'salle-accueil--cache' : ''}`}
        inert={ouvert || enTransition || enPassage}
        aria-label={oeuvre.titre}
      >
        <div className="salle-accueil__haut">
          {/* Écrit et découpé en lettres par useApparition */}
          <h1 className="salle-accueil__titre" ref={titre} />
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
        <Fleche oeuvre={suivante} sens="suivante" desactivee={enPassage} />
      </nav>
    </div>
  )
}

/**
 * Flèche œuvre précédente ou suivante, en bas : un rond ; au survol, il s'ouvre en carte
 * (maquette 477:973) avec le visuel de l'œuvre, la flèche se décale et le libellé apparaît.
 * Lance le passage par le couloir.
 */
function Fleche({ oeuvre, sens, desactivee }: { oeuvre: Oeuvre; sens: Sens; desactivee: boolean }) {
  return (
    <button type="button" className={`fleche fleche--${sens}`} disabled={desactivee} onClick={() => partirVers(oeuvre, sens)}>
      <img className="fleche__image" src={oeuvre.vignette ?? oeuvre.image} alt="" />
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

/** Popup Maladie (maquette 471:511) */
function Maladie({ oeuvre }: { oeuvre: Oeuvre }) {
  const t = oeuvre.maladieTexte
  return (
    <>
      <PopupEntete surtitre="La maladie" titre={t.titre} />
      <PopupTexte paragraphes={t.paragraphes} />
      {!!t.chiffres?.length && <PopupChiffres chiffres={t.chiffres} />}
      {t.lien && <PopupLien href={t.lien}>En savoir plus</PopupLien>}
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
