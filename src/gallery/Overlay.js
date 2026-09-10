import gsap from 'gsap';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(SplitText);

/**
 * HTML overlay showing the centered card's title + CTA. Kept as real DOM
 * (not text rendered in the 3D scene) so it stays sharp at any resolution
 * and remains accessible/selectable.
 *
 * Both fade out in place (pure alpha) on the way out, moving upward
 * slightly as they go (the CTA does, at least — see below). On the way
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
 * The CTA has no real destination (cards.json carries no `link` — there's
 * nowhere to send it, and a stale/guessed URL would just 404), so a click
 * simply reloads the page instead of navigating anywhere.
 */
export class Overlay {
  constructor({ titleEl, ctaEl }) {
    this.titleEl = titleEl;
    this.ctaEl = ctaEl;
    this.ctaLabelEl = ctaEl.querySelector('.gallery-card-cta-label');
    this.currentCardId = null;
    this.split = null;

    gsap.set(this.ctaEl, { opacity: 0, y: 12 });

    this.ctaEl.addEventListener('click', (event) => {
      event.preventDefault();
      window.location.reload();
    });
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
        gsap.set(this.titleEl, { opacity: 1 });

        // Appended now rather than built upfront, since `this.split.chars`
        // doesn't exist until this callback actually runs.
        this.timeline
          .fromTo(
            this.split.chars,
            // .char-mask (style.css) pads its clip box beyond the
            // character's own tight line-height so accents don't clip —
            // measured on a real title, that's a 24px top / 14.4px bottom
            // pad on a 76.8px-tall character (96px font, line-height
            // 0.8), meaning full clearance needs yPercent ~118.75, not
            // 100. 130 gives real headroom rather than a ~1px margin that
            // rounding/antialiasing can eat — which is what still let the
            // very top sliver of each letter show before the tween
            // started.
            { yPercent: 130 },
            { yPercent: 0, duration: 0.4, ease: 'power4.out', stagger: 0.012 }
          )
          .fromTo(
            this.ctaEl,
            { opacity: 0, y: 12 },
            { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' },
            '<'
          );
      });
  }
}
