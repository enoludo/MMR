// Central tuning knobs for the spiral gallery.
// Slots are purely visual placeholders in 3D space; the data (cards.json)
// is mapped onto them independently (see SpiralGallery#buildSlots).
export const CONFIG = {
  // Number of visual slots in the spiral, keyed by breakpoint. This is
  // deliberately decoupled from the number of cards: with 4 cards and 22
  // slots each card repeats several times around the spiral; adding cards
  // to cards.json never requires touching this.
  slotCount: {
    mobile: 10,
    tablet: 16,
    desktop: 22,
  },
  breakpoints: {
    mobile: 640,
    tablet: 1024,
  },

  // Spiral shape. Each slot travels along this curve, parametrized by
  // t in [0, 1): angle grows continuously over `spiralTurns` full
  // revolutions while height grows monotonically alongside it — a real
  // ascending/descending spiral, not a flat periodic ring.
  //
  // Radius, unlike height, is periodic *in angle* (radiusBase +
  // radiusAmplitude * cos(angle)): it peaks — closest to the camera —
  // every time the angle crosses 0 (the front), and is smallest at the
  // back (angle = PI), every single loop. That's deliberate: it's what
  // guarantees the card currently facing the camera is always the closest
  // one, and that cards visibly recede toward the back as they rotate
  // away from front, rather than radius just happening to grow with
  // scroll progress independently of which way a card is currently facing.
  //
  // Height being non-periodic means the shape isn't rotationally
  // symmetric, so it can't be spun as one rigid ring without a visible
  // seam where it wraps back on itself. Instead, each slot's own `t`
  // cycles through [0, 1) as the scroll value advances (see
  // SpiralGallery#update): it flows along the whole spiral and recycles
  // back to the start, fading out/in over `recycleFade` right at the wrap
  // point so the jump is invisible.
  //
  // The height range is deliberately modest relative to `spiralTurns`: a
  // full loop only shifts height by (heightEnd - heightStart) / turns, so
  // whichever loop currently happens to face the camera lands close to
  // the same on-screen height as any other — that's what keeps the
  // centered card genuinely centered regardless of which loop it's on.
  spiralTurns: 2.5,
  radiusBase: 4,
  radiusAmplitude: 2,
  heightStart: -1.8,
  heightEnd: 1.8,
  recycleFade: 0.06,

  cardWidth: 2.4,
  cardHeight: 1.6,

  // A flat, near-eye-level camera — barely raised or tilted — so the
  // spiral's radius change reads as cards at varying depth/size, not as
  // a cone's visible side silhouette (which is what a steep 3/4 view
  // exposes).
  cameraDistance: 8.5,
  cameraHeight: 0.3,
  cameraLookAtY: -0.1,
  cameraFov: 46,

  // Depth cueing: each card's texture is pre-blurred once into three
  // tiers (see textureTiers.js) and swapped based on live angular
  // distance from the front, cheaper and more reliable than a real-time
  // depth-of-field render pass.
  sharpAngleDeg: 20,
  softAngleDeg: 50,

  // Virtual scroll (see VirtualScroll.js). Never bound to window.scrollY.
  // Values are in spiral-progress units (t), not radians: a full 1.0
  // sends a card all the way along the spiral and back to the start.
  wheelSensitivity: 0.00028,
  touchSensitivity: 0.0007,
  rotationLerp: 0.08,
  autoRotateSpeed: 0.00009,
  idleDelayMs: 1500,
};

export function getSlotCountForWidth(width) {
  if (width <= CONFIG.breakpoints.mobile) return CONFIG.slotCount.mobile;
  if (width <= CONFIG.breakpoints.tablet) return CONFIG.slotCount.tablet;
  return CONFIG.slotCount.desktop;
}
