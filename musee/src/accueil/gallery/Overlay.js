import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

// Lettres du titre (site React) : mêmes réglages que le titre des salles (ui/apparition.ts).
// Toujours passées en copie : GSAP complète les objets qu'on lui donne.
const ENTREE_LETTRES = { yPercent: 110, opacity: 0 };
const APPARITION_LETTRES = { yPercent: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.022 };
// Sortie : les lettres repartent par le haut à travers leur masque, une à une (changement de carte,
// clic sur « Découvrir »)
const SORTIE_LETTRES = { yPercent: -110, opacity: 0, duration: 0.45, ease: 'power2.inOut', stagger: 0.012 };

/**
 * Changement de carte : délai (s) entre le départ des lettres de l'ancien titre et la montée de celles
 * du nouveau (0 = ensemble). Réglable touche M, « Titres de la spirale » (Accueil.tsx).
 */
export const reglagesTitres = { delaiEntree: 0.25 };

gsap.registerPlugin(SplitText);

/**
 * HTML overlay showing the centered card's title + CTA. Kept as real DOM
 * (not text rendered in the 3D scene) so it stays sharp at any resolution
 * and remains accessible/selectable.
 *
 * Site React (01/11) : au changement de carte, les lettres de l'ancien titre
 * partent vers le haut pendant que celles du nouveau montent (setCard,
 * faireSortir) ; le CTA reste affiché. Au clic sur « Découvrir » (cacher),
 * il s'efface en montant un peu. On the way
 * in, the CTA does the same slide in reverse (fromTo, not a plain `.to`,
 * so it always starts from the same below-rest position regardless of
 * where the exit tween left it — otherwise only the very first card
 * would slide up on entry; every one after would inherit the exit's end
 * position and slide *down* into place instead). The title is split into
 * characters (SplitText's `mask: 'chars'` wraps each one in its own
 * overflow:clip box — see the `.char-mask` rule in style.css) that rise
 * up through their own mask with a short stagger, so letters cascade in
 * one after another instead of waiting for each to finish before the
 * next starts.
 *
 * Site React : chaque carte porte un `link` (/oeuvre/<id>), posé sur le CTA ;
 * Accueil.tsx intercepte le clic et navigue sans recharger la page.
 */
export class Overlay {
  constructor({ titleEl, ctaEl }) {
    this.titleEl = titleEl;
    this.ctaEl = ctaEl;
    this.ctaLabelEl = ctaEl.querySelector('.gallery-card-cta-label');
    this.currentCardId = null;
    this.split = null;
    // Site React : titre et CTA retenus hors de l'écran pendant les transitions vers les salles
    this.masque = false;
    /** Calques des titres qui partent (faireSortir), dont le dernier, qui n'est pas encore effacé */
    this.sorties = new Set();
    this.sortieEnCours = null;

    gsap.set(this.ctaEl, { opacity: 0, y: 12 });

    // Site React : le clic sur le CTA est géré par Accueil.tsx (navigation vers card.link).
  }

  dispose() {
    this.timeline?.kill();
    this.split?.revert();
    for (const calque of this.sorties) this.retirer(calque);
  }

  setCard(card) {
    if (!card || card.id === this.currentCardId) return;
    this.currentCardId = card.id;

    // Site React (01/11, demande de Ludovic) : les deux titres se croisent. Les lettres de l'ancien
    // partent vers le haut sur un calque à part, figé à sa place, pendant que le nouveau titre est
    // écrit dans le h2 et monte du bas, comme avant. Un scroll rapide fait repartir un titre en train
    // d'entrer depuis là où en sont ses lettres (même éléments, mêmes tweens repris).
    this.timeline?.kill();
    // Titre caché (grille, transition) : rien ne part ni n'entre. Sinon les lettres cachées sous leur
    // masque partiraient vers le haut en le traversant (vu au retour dans la grille, quand la carte
    // centrée change pendant que les vignettes se redéploient)
    if (this.masque) {
      if (this.split) gsap.killTweensOf(this.split.chars);
      this.poser(card);
      return;
    }
    const bas = this.ctaEl.getBoundingClientRect().top;
    this.faireSortir();
    this.poser(card);

    // Le CTA (même libellé pour toutes les œuvres) reste affiché ; si le nouveau titre n'a pas le
    // même nombre de lignes, le bloc se recentre et le CTA glisse vers sa nouvelle place
    const ecart = bas - this.ctaEl.getBoundingClientRect().top;
    this.timeline = gsap
      .timeline()
      .fromTo(this.split.chars, { ...ENTREE_LETTRES }, { ...APPARITION_LETTRES }, reglagesTitres.delaiEntree);
    if (Math.abs(ecart) > 0.5) {
      const y = gsap.getProperty(this.ctaEl, 'y');
      this.timeline
        .fromTo(this.ctaEl, { y: y + ecart }, { y: 0, duration: 0.6, ease: 'power3.inOut' }, 0)
        .to(this.ctaEl, { opacity: 1, duration: 0.4, ease: 'power2.out' }, 0);
    } else this.timeline.to(this.ctaEl, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0);
  }

  /**
   * L'ancien titre quitte le h2 pour un calque posé exactement par-dessus (positionné dans
   * .accueil__carte, qui ne bouge pas quand le bloc se recentre) ; ses lettres partent de là où elles
   * en sont. Un calque plus ancien encore à l'écran (scroll rapide) s'efface vite : jamais plus de
   * deux titres à la fois.
   */
  faireSortir() {
    const split = this.split;
    if (!split) return;
    // Copie : revert() vide split.chars
    const lettres = [...split.chars];
    this.split = null;
    gsap.killTweensOf(lettres);
    if (!lettres.length) return split.revert();
    const parent = this.titleEl.offsetParent ?? document.body;
    const cadre = this.titleEl.getBoundingClientRect();
    const origine = parent.getBoundingClientRect();
    const calque = document.createElement('div');
    calque.className = `${this.titleEl.className} accueil__titre--sortie`;
    calque.setAttribute('aria-hidden', 'true');
    // Un pixel de marge de chaque côté : les lignes se coupent comme dans le h2
    Object.assign(calque.style, {
      left: `${cadre.left - origine.left - 1}px`,
      top: `${cadre.top - origine.top}px`,
      width: `${cadre.width + 2}px`,
    });
    calque.append(...this.titleEl.childNodes);
    parent.append(calque);
    // Défait le découpage (le h2 reprend son texte) une fois les lettres emportées : sinon le
    // prochain SplitText du h2 le défait lui-même et réécrit l'ancien titre
    split.revert();

    const ancien = this.sortieEnCours;
    if (ancien) gsap.to(ancien, { opacity: 0, duration: 0.15, ease: 'power1.out', onComplete: () => this.retirer(ancien) });
    this.sortieEnCours = calque;
    this.sorties.add(calque);
    gsap.to(lettres, { ...SORTIE_LETTRES, onComplete: () => this.retirer(calque) });
  }

  retirer(calque) {
    gsap.killTweensOf(calque.querySelectorAll('.char'));
    gsap.killTweensOf(calque);
    calque.remove();
    this.sorties.delete(calque);
    if (this.sortieEnCours === calque) this.sortieEnCours = null;
  }

  /** Écrit le titre et le CTA de la carte, le titre découpé en lettres (cachées). */
  poser(card) {
    // Must run before textContent is overwritten below: revert()
    // restores the h2's plain-text DOM so SplitText isn't left
    // diffing against nodes that textContent already wiped out.
    // (Déjà fait par faireSortir() au changement de carte.)
    this.split?.revert();

    this.titleEl.textContent = card.title;
    this.ctaLabelEl.textContent = card.cta;
    this.ctaEl.href = card.link;
    // Salle fermée à la visite (oeuvres.ts) : le bouton reste, désactivé
    this.ctaEl.classList.toggle('accueil__cta--fermee', card.ouverte === false);
    if (card.ouverte === false) this.ctaEl.setAttribute('aria-disabled', 'true');
    else this.ctaEl.removeAttribute('aria-disabled');

    this.split = new SplitText(this.titleEl, {
      // 'words' too, not just 'chars': each character is its own
      // atomic inline-block (needed so the mask can clip/translate it
      // independently), and atomic inline-level boxes are each a line-
      // break opportunity in their own right — without a word-level
      // wrapper holding its characters together, the browser was
      // free to wrap mid-word (e.g. "SILENCIEUS" / "E") the moment
      // the title's max-width forced a line break.
      type: 'words, chars',
      mask: 'chars',
      charsClass: 'char',
      wordsClass: 'word',
    });
    // .char-mask (style.css) pads its clip box beyond the character's own
    // tight line-height so accents don't clip. Les lettres se fondent en
    // montant (30/10, comme dans les salles) : encore transparentes en
    // entrant dans leur masque, 110 suffit.
    gsap.set(this.split.chars, { ...ENTREE_LETTRES });
    if (this.masque) gsap.set(this.ctaEl, { opacity: 0, y: 12 });
  }

  /**
   * Site React (transitions spirale ↔ salle, Accueil.tsx) : les lettres du titre repartent par
   * le haut, une à une, à travers leur masque, et le CTA s'efface ; ils restent cachés
   * (même si la carte change) jusqu'à montrer().
   */
  cacher() {
    if (this.masque) return;
    this.masque = true;
    this.timeline?.kill();
    this.timeline = gsap.timeline();
    if (this.split) this.timeline.to(this.split.chars, { ...SORTIE_LETTRES }, 0);
    this.timeline.to(this.ctaEl, { opacity: 0, y: -10, duration: 0.25, ease: 'power1.in' }, 0);
  }

  /** Le titre remonte lettre par lettre et le CTA revient, comme à chaque changement de carte. */
  montrer() {
    if (!this.masque) return;
    this.masque = false;
    this.timeline?.kill();
    if (!this.split) return;
    this.timeline = gsap
      .timeline()
      .fromTo(this.split.chars, { ...ENTREE_LETTRES }, { ...APPARITION_LETTRES })
      .fromTo(this.ctaEl, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '<');
  }
}
