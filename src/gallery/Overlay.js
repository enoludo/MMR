import gsap from 'gsap';

/**
 * HTML overlay showing the centered card's title + CTA. Kept as real DOM
 * (not text rendered in the 3D scene) so it stays sharp at any resolution
 * and remains accessible/selectable.
 *
 * The outgoing card fades out in place (pure alpha), then the incoming one
 * rises up into view through its mask wrapper (see the `-mask` elements in
 * index.html: `overflow: hidden` with no fixed height, so each always
 * clips right at its own content's edge) — a reveal rather than a
 * fade+slide, since visibility comes from being clipped out below the
 * mask, not from opacity.
 */
export class Overlay {
  constructor({ titleEl, ctaEl }) {
    this.titleEl = titleEl;
    this.ctaEl = ctaEl;
    this.ctaLabelEl = ctaEl.querySelector('.gallery-card-cta-label');
    this.currentCardId = null;

    gsap.set([this.titleEl, this.ctaEl], { opacity: 0, yPercent: 100 });
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
      .to([this.titleEl, this.ctaEl], {
        opacity: 0,
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
        { opacity: 1, yPercent: 100 },
        { yPercent: 0, duration: 0.5, ease: 'power4.inOut', stagger: 0.05 }
      );
  }
}
