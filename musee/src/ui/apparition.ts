import { useLayoutEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(SplitText)

/** Courbes CSS équivalentes à celles de GSAP, pour les sorties */
const POWER2_INOUT = 'cubic-bezier(0.45, 0, 0.55, 1)'
const SINE_INOUT = 'cubic-bezier(0.37, 0, 0.63, 1)'

/**
 * Apparition des textes comme sur la spirale (accueil/gallery/Overlay.js) : le titre, découpé
 * en lettres, chacune dans son propre masque, monte lettre par lettre ; les autres éléments
 * (`autres`, sélecteur CSS dans le conteneur) montent en fondu juste après. À la disparition,
 * tout repart par le haut, dans le même ordre (en cascade, plus lentement, si `cascade`).
 *
 * Le titre est écrit ici, pas par React (SplitText remplace son contenu) : l'élément doit être
 * rendu vide. Sans animation au montage : le texte est tout de suite dans son état.
 *
 * Les sorties sont jouées par le navigateur (Web Animations), pas par GSAP : elles restent
 * fluides même quand la page est occupée (au retour vers la spirale, celle-ci se prépare
 * pendant que le texte part, et la page se fige par moments ; avec GSAP, on n'en voyait que
 * des morceaux). Elles sont annulées au retour du texte, que GSAP reprend.
 */
export function useApparition({
  conteneur,
  titre,
  texte,
  autres,
  visible,
  cascade = false,
  delai = 0,
}: {
  conteneur: RefObject<HTMLElement | null>
  titre: RefObject<HTMLElement | null>
  texte: string
  autres: string
  visible: boolean
  /**
   * Disparition plus lente, élément par élément (titre, puis chacun des autres), chaque départ
   * chevauchant un peu le précédent : départ vers l'œuvre précédente / suivante
   */
  cascade?: boolean
  /** Attente avant l'apparition (s) : le temps qu'un autre panneau parte */
  delai?: number
}) {
  const decoupe = useRef<SplitText | null>(null)
  const anim = useRef<gsap.core.Timeline | null>(null)
  const sorties = useRef<Animation[]>([])
  const annulerSorties = () => {
    sorties.current.forEach((a) => a.cancel())
    sorties.current = []
  }
  /** Fait partir des éléments l'un après l'autre (`ecart` s entre deux), depuis leur état actuel */
  const sortir = (els: Element[], vers: Keyframe, duree: number, easing: string, debut: number, ecart: number) =>
    els.forEach((el, i) =>
      sorties.current.push(el.animate([vers], { duration: duree * 1000, delay: (debut + i * ecart) * 1000, easing, fill: 'forwards' })),
    )
  const etat = useRef(visible)
  const elements = () => gsap.utils.toArray<HTMLElement>(conteneur.current?.querySelectorAll(autres) ?? [])

  // Découpe du titre (à chaque changement d'œuvre)
  useLayoutEffect(() => {
    const el = titre.current
    if (!el) return
    el.textContent = texte
    // 'words' aussi : les lettres d'un mot restent ensemble au retour à la ligne (voir Overlay.js)
    const d = new SplitText(el, { type: 'words, chars', mask: 'chars', charsClass: 'char', wordsClass: 'word' })
    decoupe.current = d
    gsap.set(d.chars, etat.current ? { yPercent: 0, opacity: 1 } : { yPercent: 110, opacity: 0 })
    return () => {
      d.revert()
      decoupe.current = null
    }
  }, [titre, texte])

  // État de départ des autres éléments
  useLayoutEffect(() => {
    gsap.set(elements(), etat.current ? { opacity: 1, y: 0 } : { opacity: 0, y: 12 })
    return () => {
      anim.current?.kill()
      annulerSorties()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (etat.current === visible) return
    etat.current = visible
    anim.current?.kill()
    anim.current = null
    const lettres = decoupe.current?.chars ?? []
    if (visible) {
      annulerSorties()
      const tl = gsap.timeline({ delay: delai })
      // Lettres plus douces que le titre de la spirale (demande de Ludovic du 30/10) : plus lentes,
      // en fondu, départ et arrêt progressifs
      tl.fromTo(lettres, { yPercent: 110, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.022 }, 0)
      tl.fromTo(elements(), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 }, 0.3)
      anim.current = tl
    } else if (cascade) {
      sortir(lettres, { transform: 'translate(0, -110%)', opacity: 0 }, 0.6, POWER2_INOUT, 0, 0.018)
      sortir(elements(), { transform: 'translateY(-16px)', opacity: 0 }, 0.5, POWER2_INOUT, 0.35, 0.12)
    } else {
      // Vers la spirale : en douceur, mais fini (≈ 0,7 s) quand la caméra arrive à la vue initiale
      // (0,6 s au plus tôt), où la page de la salle laisse place à sa photo
      sortir(lettres, { transform: 'translate(0, -110%)', opacity: 0 }, 0.5, SINE_INOUT, 0, 0.01)
      sortir(elements(), { transform: 'translateY(-12px)', opacity: 0 }, 0.45, SINE_INOUT, 0.05, 0.05)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
}
