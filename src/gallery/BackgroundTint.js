import gsap from 'gsap';

/**
 * Smoothly tweens the page background color to match the currently
 * centered card's mood color (see cardColor.js). Gated on the card's id
 * like Overlay#setCard — but if that card's color hasn't been computed yet
 * (its image may still be loading), `currentCardId` is deliberately left
 * unset so the next frame's call retries instead of the transition being
 * silently skipped forever.
 */
export class BackgroundTint {
  constructor(el, initialColor) {
    this.el = el;
    this.currentCardId = null;
    this.current = { ...initialColor };
  }

  setCard(card, color) {
    if (!card || !color || card.id === this.currentCardId) return;
    this.currentCardId = card.id;

    gsap.to(this.current, {
      r: color.r,
      g: color.g,
      b: color.b,
      duration: 1.2,
      ease: 'power2.out',
      onUpdate: () => {
        const { r, g, b } = this.current;
        this.el.style.backgroundColor = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
      },
    });
  }
}
