// Central tuning knobs for the spiral gallery.
// Slots are purely visual placeholders in 3D space; the data (cards.json)
// is mapped onto them independently (see SpiralGallery#buildSlots).
export const CONFIG = {
  // Number of visual slots in the spiral, keyed by breakpoint. This is
  // deliberately decoupled from the number of cards: with 4 cards and 12
  // slots each card repeats 3 times around the ring; adding cards to
  // cards.json never requires touching this.
  slotCount: {
    mobile: 8,
    tablet: 10,
    desktop: 12,
  },
  breakpoints: {
    mobile: 640,
    tablet: 1024,
  },

  // Spiral shape (periodic in angle, so the ring tiles seamlessly under
  // infinite rotation — no discontinuity when wrapping past 2*PI).
  radius: 4.4,
  radiusAmplitude: 0.7,
  verticalAmplitude: 1.0,
  spiralLoops: 2,
  spiralPhase: Math.PI / 3,

  cardWidth: 1.7,
  cardHeight: 2.2,

  cameraDistance: 9.5,
  cameraHeight: 0.4,
  cameraFov: 45,

  // Virtual scroll (see VirtualScroll.js). Never bound to window.scrollY.
  wheelSensitivity: 0.0022,
  touchSensitivity: 0.006,
  rotationLerp: 0.08,
  autoRotateSpeed: 0.0009,
  idleDelayMs: 1500,
};

export function getSlotCountForWidth(width) {
  if (width <= CONFIG.breakpoints.mobile) return CONFIG.slotCount.mobile;
  if (width <= CONFIG.breakpoints.tablet) return CONFIG.slotCount.tablet;
  return CONFIG.slotCount.desktop;
}
