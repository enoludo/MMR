import { useEffect, useRef, type ReactNode } from 'react'
import { IconeCroix } from './icones'

/**
 * Popup d'une salle (maquettes Figma 447:602 « Maladie » et 448:911 « Manifeste »),
 * réutilisable dans toutes les salles. Il se compose avec les blocs ci-dessous :
 *
 *   <Popup ouvert={…} onFermer={…} etiquette="La maladie">
 *     <PopupEntete surtitre="La maladie" titre="Acromégalie" />
 *     <PopupTexte paragraphes={[…]} />
 *     <PopupChiffres chiffres={[…]} />
 *     <PopupLien href="…">En savoir plus</PopupLien>
 *   </Popup>
 *
 * Mise en page (voir style.css, section Popup) : deux colonnes sur cinq de la grille
 * de la maquette, à droite, centré verticalement ; blocs espacés de 24 px.
 * Le popup garde le focus clavier pendant qu'il est ouvert et le rend en se fermant ;
 * la croix, un clic à côté (sur la scène) ou Échap le ferment.
 */
export function Popup({
  ouvert,
  onFermer,
  etiquette,
  children,
}: {
  ouvert: boolean
  onFermer: () => void
  /** Nom du popup pour les lecteurs d'écran */
  etiquette: string
  children: ReactNode
}) {
  const cadre = useRef<HTMLElement>(null)
  const fermer = useRef<HTMLButtonElement>(null)
  const retour = useRef<HTMLElement | null>(null)
  const quandFermer = useRef(onFermer)
  useEffect(() => {
    quandFermer.current = onFermer
  })

  useEffect(() => {
    if (ouvert) {
      retour.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      fermer.current?.focus({ preventScroll: true })
      const clavier = (e: KeyboardEvent) => e.key === 'Escape' && quandFermer.current()
      // Clic à côté du popup ; les boutons et liens de l'interface gardent leur propre action
      const clic = (e: MouseEvent) => {
        const cible = e.target instanceof Element ? e.target : null
        if (!cible || cadre.current?.contains(cible) || cible.closest('button, a, input, [class*="leva"]')) return
        quandFermer.current()
      }
      window.addEventListener('keydown', clavier)
      window.addEventListener('click', clic)
      return () => {
        window.removeEventListener('keydown', clavier)
        window.removeEventListener('click', clic)
      }
    }
    // À la fermeture, le focus revient sur le bouton qui avait ouvert le popup
    const actif = document.activeElement
    if (retour.current?.isConnected && (!actif || actif === document.body || cadre.current?.contains(actif))) {
      retour.current.focus({ preventScroll: true })
    }
    retour.current = null
  }, [ouvert])

  return (
    <aside ref={cadre} className={`popup ${ouvert ? 'popup--ouvert' : ''}`} inert={!ouvert} aria-label={etiquette}>
      <button type="button" ref={fermer} className="bouton-rond popup__fermer" aria-label="Fermer" onClick={onFermer}>
        <IconeCroix />
      </button>
      <div className="popup__defilement">
        <div className="popup__contenu">{children}</div>
      </div>
    </aside>
  )
}

/** Surtitre (16 px gras, capitales) et, s'il y en a un, grand titre (Marquez 48 px). */
export function PopupEntete({ surtitre, titre }: { surtitre: string; titre?: string }) {
  return (
    <header className={`popup__entete ${titre ? 'popup__entete--titre' : ''}`}>
      <p className="popup__surtitre">{surtitre}</p>
      {titre && <h2 className="popup__titre">{titre}</h2>}
    </header>
  )
}

/** Paragraphes de texte courant ; un « \n » dans un paragraphe passe à la ligne. */
export function PopupTexte({ paragraphes }: { paragraphes: string[] }) {
  return (
    <div className="popup__texte">
      {paragraphes.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}

/** Chiffres clés : un libellé et une valeur par ligne, séparés par un filet. */
export function PopupChiffres({ chiffres }: { chiffres: { libelle: string; valeur: string }[] }) {
  return (
    <dl className="popup__chiffres">
      {chiffres.map((c) => (
        <div key={c.libelle} className="popup__chiffre">
          <dt>{c.libelle}</dt>
          <dd>{c.valeur}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Bouton lien (« En savoir plus »), ouvert dans un nouvel onglet. */
export function PopupLien({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="pilule pilule--sombre popup__lien" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}
