import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'
import { IconeCroix } from './icones'

gsap.registerPlugin(SplitText)

/** Blocs du popup qui apparaissent l'un après l'autre (le grand titre, lui, lettre par lettre) */
const BLOCS = '.popup__surtitre, .popup__texte p, .popup__chiffre, .popup__lien'

/**
 * Popup d'une salle (maquettes Figma 471:511 « Maladie » et 477:2158 « Manifeste »),
 * réutilisable dans toutes les salles. Il se compose avec les blocs ci-dessous :
 *
 *   <Popup ouvert={…} onFermer={…} etiquette="La maladie">
 *     <PopupEntete surtitre="La maladie" titre="Acromégalie" />
 *     <PopupTexte paragraphes={[…]} />
 *     <PopupChiffres chiffres={[…]} />
 *     <PopupLien href="…">En savoir plus</PopupLien>
 *   </Popup>
 *
 * Mise en page (voir style.css, section Popup) : à droite, centré verticalement, texte sur
 * 461 px ; blocs espacés de 24 px.
 * Le popup garde le focus clavier pendant qu'il est ouvert et le rend en se fermant ;
 * la croix, un clic à côté (sur la scène) ou Échap le ferment.
 *
 * Ouverture dans l'esprit du premier écran (ui/apparition.ts) : le cadre arrive, puis le
 * surtitre, le grand titre lettre par lettre, et chaque bloc l'un après l'autre en fondu montant.
 * Fermeture : tout repart par le haut dans le même ordre, puis le cadre s'efface.
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

  // Apparition du contenu à chaque ouverture, disparition dans le même ordre à la fermeture
  const anim = useRef<{ tl: gsap.core.Timeline; decoupe: SplitText | null } | null>(null)
  const premier = useRef(true)
  useLayoutEffect(() => {
    const racine = cadre.current
    const debut = premier.current
    premier.current = false
    if (!racine || (debut && !ouvert)) return // au montage, fermé : rien à faire disparaître
    const precedente = anim.current
    precedente?.tl.kill()
    precedente?.decoupe?.revert()
    anim.current = null
    const croix = fermer.current
    const blocs = gsap.utils.toArray<HTMLElement>(racine.querySelectorAll(BLOCS))
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.set([...blocs, croix], { clearProps: 'opacity,transform' })
      return
    }
    const titre = racine.querySelector<HTMLElement>('.popup__titre')
    // Découpé le temps de l'ouverture (React reste maître du texte quand le popup est fermé)
    const decoupe = titre && new SplitText(titre, { type: 'words, chars', mask: 'chars', charsClass: 'char', wordsClass: 'word' })
    const [surtitre, ...suite] = blocs
    const tl = gsap.timeline()
    if (ouvert) {
      // Le cadre arrive en 0,6 s après 0,2 s (style.css) : le contenu suit, en se chevauchant
      tl.fromTo(croix, { opacity: 0 }, { opacity: 1, duration: 0.5, ease: 'power1.out' }, 0.45)
      if (surtitre) tl.fromTo(surtitre, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }, 0.35)
      // Lettres douces, comme le titre de la salle (ui/apparition.ts) : elles glissent et se fondent
      if (decoupe) tl.fromTo(decoupe.chars, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.022 }, 0.45)
      tl.fromTo(suite, { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', stagger: 0.1 }, decoupe ? 0.7 : 0.5)
      // Le titre reste découpé tant que le popup est ouvert (sinon accents et espacement des
      // lettres sautaient à la fin) ; il redevient un texte simple une fois le popup refermé
      tl.eventCallback('onComplete', () => {
        gsap.set([...blocs, croix], { clearProps: 'opacity,transform' })
      })
    } else {
      // Tout repart par le haut, dans le même ordre ; le cadre s'efface ensuite (0,35 s, style.css)
      tl.to(croix, { opacity: 0, duration: 0.3, ease: 'power1.in' }, 0)
      if (surtitre) tl.to(surtitre, { opacity: 0, y: -10, duration: 0.35, ease: 'power2.in' }, 0)
      if (decoupe) tl.to(decoupe.chars, { yPercent: -110, opacity: 0, duration: 0.45, ease: 'power2.inOut', stagger: 0.015 }, 0.03)
      tl.to(suite, { opacity: 0, y: -12, duration: 0.35, ease: 'power2.in', stagger: 0.06 }, decoupe ? 0.12 : 0.06)
      // Une fois le cadre effacé, le titre redevient un texte simple (il change avec l'œuvre)
      tl.call(() => {
        decoupe?.revert()
        if (anim.current?.tl === tl) anim.current = null
      }, [], 0.85)
    }
    anim.current = { tl, decoupe }
  }, [ouvert])
  useLayoutEffect(
    () => () => {
      anim.current?.tl.kill()
      anim.current?.decoupe?.revert()
    },
    [],
  )

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

/** Surtitre (16 px) et, s'il y en a un, grand titre (Marquez 60 px), soulignés d'un filet. */
export function PopupEntete({ surtitre, titre }: { surtitre: string; titre?: string }) {
  return (
    <header className="popup__entete">
      <p className="popup__surtitre">{surtitre}</p>
      {titre && <h2 className="popup__titre">{titre}</h2>}
    </header>
  )
}

/**
 * Paragraphes de texte courant (16 px Light) ; un « \n » dans un paragraphe passe à la ligne.
 * `petit` : 14 px, comme le manifeste de la maquette.
 */
export function PopupTexte({ paragraphes, petit = false }: { paragraphes: string[]; petit?: boolean }) {
  return (
    <div className={`popup__texte ${petit ? 'popup__texte--petit' : ''}`}>
      {paragraphes.map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  )
}

/** Chiffres clés : un libellé et une valeur, deux par ligne, chacun souligné d'un filet. */
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
    <a className="pilule popup__lien" href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  )
}
