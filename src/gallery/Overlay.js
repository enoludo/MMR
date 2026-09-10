import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/**
 * HTML overlay showing the centered card's title + CTA. Kept as real DOM
 * (not text rendered in the 3D scene) so it stays sharp at any resolution
 * and remains accessible/selectable.
 *
 * Both fade out in place (pure alpha) on the way out. On the way in, the
 * CTA does a plain fade+slide, but the title is split into characters
 * (SplitText's `mask: 'chars'` wraps each one in its own overflow:clip
 * box — see the `.char-mask` rule in style.css) that rise up through
 * their own mask with a short stagger, so letters cascade in one after
 * another instead of waiting for each to finish before the next starts.
 */
export class Overlay {
  constructor({ titleEl, ctaEl }) {
    this.titleEl = titleEl;
    this.ctaEl = ctaEl;
    this.ctaLabelEl = ctaEl.querySelector('.gallery-card-cta-label');
    this.currentCardId = null;
    this.split = null;

    gsap.set(this.ctaEl, { opacity: 0, y: 12 });
  }

  setCard(card) {
    if (!card || card.id === this.currentCardId) return;
    this.currentCardId = card.id;

    // A fast scroll can change the centered card again before the previous
    // crossfade finishes; without killing it first, the two timelines race
    // and the older one's `.call()` can overwrite the newer text last.
    this.timeline?.kill();

    this.timeline = gsap.timeline();
    this.timeline
      .to(this.titleEl, { opacity: 0, duration: 0.25, ease: 'power1.in' }, 0)
      .to(this.ctaEl, { opacity: 0, y: -10, duration: 0.25, ease: 'power1.in' }, 0)
      .call(() => {
        // Must run before textContent is overwritten below: revert()
        // restores the h2's plain-text DOM so SplitText isn't left
        // diffing against nodes that textContent already wiped out.
        this.split?.revert();

        this.titleEl.textContent = card.title;
        this.ctaLabelEl.textContent = card.cta;
        this.ctaEl.href = card.link;

        this.split = new SplitText(this.titleEl, {
          type: 'chars',
          mask: 'chars',
          charsClass: 'char',
        });
        gsap.set(this.titleEl, { opacity: 1 });

        // Appended now rather than built upfront, since `this.split.chars`
        // doesn't exist until this callback actually runs.
        this.timeline
          .fromTo(
            this.split.chars,
            { yPercent: 100 },
            { yPercent: 0, duration: 0.5, ease: 'sine.out', stagger: 0.025 }
          )
          .to(this.ctaEl, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, '<');
      });
  }
}
