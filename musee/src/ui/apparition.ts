import { useLayoutEffect, useRef, type RefObject } from 'react'
import gsap from 'gsap'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(SplitText)

/**
 * Apparition des textes comme sur la spirale (accueil/gallery/Overlay.js) : le titre, découpé
 * en lettres, chacune dans son propre masque, monte lettre par lettre ; les autres éléments
 * (`autres`, sélecteur CSS dans le conteneur) montent en fondu juste après. À la disparition,
 * tout repart par le haut, dans le même ordre.
 *
 * Le titre est écrit ici, pas par React (SplitText remplace son contenu) : l'élément doit être
 * rendu vide. Sans animation au montage : le texte est tout de suite dans son état.
 */
export function useApparition({
  conteneur,
  titre,
  texte,
  autres,
  visible,
}: {
  conteneur: RefObject<HTMLElement | null>
  titre: RefObject<HTMLElement | null>
  texte: string
  autres: string
  visible: boolean
}) {
  const decoupe = useRef<SplitText | null>(null)
  const anim = useRef<gsap.core.Timeline | null>(null)
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
    gsap.set(d.chars, { yPercent: etat.current ? 0 : 130 })
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
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useLayoutEffect(() => {
    if (etat.current === visible) return
    etat.current = visible
    anim.current?.kill()
    const lettres = decoupe.current?.chars ?? []
    const tl = gsap.timeline()
    if (visible) {
      // Mêmes réglages que le titre de la spirale
      tl.fromTo(lettres, { yPercent: 130 }, { yPercent: 0, duration: 0.4, ease: 'power4.out', stagger: 0.012 }, 0)
      tl.fromTo(elements(), { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.06 }, 0.15)
    } else {
      tl.to(lettres, { yPercent: -130, duration: 0.3, ease: 'power2.in', stagger: 0.008 }, 0)
      tl.to(elements(), { opacity: 0, y: -10, duration: 0.25, ease: 'power1.in', stagger: 0.03 }, 0)
    }
    anim.current = tl
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])
}
