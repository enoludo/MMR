import gsap from 'gsap';

/**
 * HTML overlay showing the centered card's title + CTA. Kept as real DOM
 * (not text rendered in the 3D scene) so it stays sharp at any resolution
 * and remains accessible/selectable.
 */
export class Overlay {
  constructor({ titleEl, ctaEl }) {
    this.titleEl = titleEl;
    this.ctaEl = ctaEl;
    this.ctaLabelEl = ctaEl.querySelector('.gallery-card-cta-label');
    this.currentCardId = null;

    gsap.set([this.titleEl, this.ctaEl], { opacity: 0, y: 12 });
  }

  setCard(card) {
    if (!card || card.id === this.currentCardId) return;
    this.currentCardId = card.id;

    const timeline = gsap.timeline();
    timeline
      .to([this.titleEl, this.ctaEl], {
        opacity: 0,
        y: -10,
        duration: 0.25,
        ease: 'power1.in',
      })
      .call(() => {
        this.titleEl.textContent = card.title;
        this.ctaLabelEl.textContent = card.cta;
        this.ctaEl.href = card.link;
      })
      .fromTo(
        [this.titleEl, this.ctaEl],
        { opacity: 0, y: 12 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out', stagger: 0.05 }
      );
  }
}
