import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useProgress } from '@react-three/drei'
import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'
import { nouvelleCle, store, useEtat, type Sens } from '../store'
import { lienOeuvre, oeuvres, type Oeuvre, type Onglet } from '../oeuvres'
import { EnTete } from './EnTete'
import { IconeChevron, IconeCroix, IconePartage } from './icones'
import { Popup, PopupChiffres, PopupEntete, PopupLien, PopupTexte } from './Popup'
import { sortir } from '../transition'
import { useApparition } from './apparition'


/** Affiche le premier écran ou un popup, et envoie la caméra vers le point de vue associé (voir Oeuvre.vues). */
export function choisirOnglet(oeuvre: Oeuvre, onglet: Onglet) {
  const vue = oeuvre.vues[onglet]
  const i = vue ? oeuvre.salle.etapes.findIndex((e) => e.id === vue) : -1
  store.set({ onglet, demande: i >= 0 ? i : 'cercle' })
}

/** Part vers la salle d'une autre œuvre, par la porte et le couloir (voir scene/passage.ts). */
function partirVers(oeuvre: Oeuvre, sens: Sens) {
  if (store.get().passage) return
  store.set({ onglet: 'info', passage: { cle: nouvelleCle(), oeuvre: oeuvre.id, sens } })
}

/**
 * Interface d'une salle, d'après la maquette Figma (écrans 445:275, 447:602, 448:911) :
 * header avec le titre de l'œuvre (retour à la collection), premier écran à gauche
 * (titre, liens Maladie et Manifeste, soutien, partage), popups Maladie et Manifeste
 * à droite, œuvre précédente / suivante en bas.
 */
export function InterfaceSalle({ oeuvre }: { oeuvre: Oeuvre }) {
  const onglet = useEtat((e) => e.onglet)
  const enPassage = useEtat((e) => !!e.passage)
  // Transition avec la spirale : en entrant, le premier écran apparaît quand l'image de la carte
  // s'efface ; en sortant, il disparaît dès que la caméra repart vers la vue initiale.
  // Titre lettre par lettre et liens en fondu, comme le titre de la spirale.
  const enTransition = useEtat((e) => !!e.transition && !(e.transition.sens === 'entree' && e.transition.phase === 'fondu'))
  const premierEcran = useRef<HTMLElement>(null)
  const titre = useRef<HTMLHeadingElement>(null)
  useApparition({
    conteneur: premierEcran,
    titre,
    texte: oeuvre.titre,
    autres: '.salle-accueil__liens > *, .salle-accueil__bas > *',
    visible: !enTransition,
  })
  const ouvert = onglet !== 'info'

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
              if (sortir()) e.preventDefault()
            }}
          >
            <span className="pilule__texte">{oeuvre.titre}</span>
            <span className="pilule__icone"><IconeCroix /></span>
          </Link>
        }
      />

      {/* Premier écran : on ouvre les popups depuis ses liens Maladie et Manifeste */}
      <section
        ref={premierEcran}
        className={`salle-accueil ${ouvert ? 'salle-accueil--cache' : ''}`}
        inert={ouvert || enTransition}
        aria-label={oeuvre.titre}
      >
        <div className="salle-accueil__haut">
          {/* Écrit et découpé en lettres par useApparition */}
          <h1 className="salle-accueil__titre" ref={titre} />
          <div className="salle-accueil__liens">
            <button
              type="button"
              className="lien-popup lien-popup--maladie"
              onClick={() => choisirOnglet(oeuvre, 'maladie')}
            >
              <span className="lien-popup__libelle">Maladie</span>
              <span className="lien-popup__maladie">
                {oeuvre.maladie || 'À venir'}
                <IconeChevron />
              </span>
            </button>
            <button
              type="button"
              className="lien-popup"
              onClick={() => choisirOnglet(oeuvre, 'manifeste')}
            >
              <span className="lien-popup__libelle">
                Manifeste
                <IconeChevron />
              </span>
            </button>
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
        <button type="button" className="pilule pied__precedente" disabled={enPassage} onClick={() => partirVers(precedente, 'precedente')}>
          <CaretLeftIcon size={12} weight="bold" aria-hidden />
          <span>Œuvre précédente</span>
        </button>
        <button type="button" className="pilule pied__suivante" disabled={enPassage} onClick={() => partirVers(suivante, 'suivante')}>
          <span>Œuvre suivante</span>
          <CaretRightIcon size={12} weight="bold" aria-hidden />
        </button>
      </nav>
    </div>
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

/** Popup Maladie (maquette 447:602) */
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

/** Popup Manifeste (maquette 448:911) */
function Manifeste({ oeuvre }: { oeuvre: Oeuvre }) {
  return (
    <>
      <PopupEntete surtitre="Manifeste" />
      <PopupTexte paragraphes={oeuvre.manifeste} />
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
    <button type="button" className="pilule pilule--sombre pilule--partage" onClick={partager}>
      <IconePartage />
      <span aria-live="polite">{copie ? 'Lien copié' : 'Partager cette œuvre'}</span>
    </button>
  )
}

function Chargement() {
  const { active, progress } = useProgress()
  const [fini, setFini] = useState(false)
  // En entrant depuis la spirale, l'image de la carte sert d'écran d'attente : la barre seule
  const [discret] = useState(() => store.get().transition?.sens === 'entree')
  useEffect(() => {
    if (!active && progress === 100) {
      const t = setTimeout(() => setFini(true), 400)
      return () => clearTimeout(t)
    }
  }, [active, progress])
  if (fini) return null
  return (
    <div className={`chargement ${discret ? 'chargement--discret' : ''} ${!active && progress === 100 ? 'chargement--fin' : ''}`}>
      {!discret && <img className="chargement__logo" src="/assets/logo-mmr.png" alt="Musée des Maladies Rares" />}
      <div className="chargement__barre"><span style={{ width: `${progress}%` }} /></div>
    </div>
  )
}
