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

  // Spiral shape. Each slot travels along this curve, parametrized by
  // t in [0, 1): angle grows continuously over `spiralTurns` full
  // revolutions while radius and height grow monotonically alongside it
  // (angle croissant + décalage vertical/profondeur progressif) — a real
  // spiral/conical helix, not a periodic wave.
  //
  // A true spiral like this isn't rotationally symmetric, so it can't be
  // spun as one rigid ring without a visible seam where it wraps back on
  // itself. Instead, each slot's own `t` cycles through [0, 1) as the
  // scroll value advances (see SpiralGallery#update): it flows outward
  // along the whole spiral and recycles back to the start, fading out/in
  // over `recycleFade` right at the wrap point so the jump is invisible.
  // Tighter and shallower than the first pass: fewer turns and a smaller
  // radius/height range keep the cards clustered and overlapping in a
  // dense collage rather than spread thin around a big, sparse coil.
  spiralTurns: 1.4,
  radiusMin: 1.4,
  radiusMax: 3.6,
  heightStart: 1.6,
  heightEnd: -1.6,
  recycleFade: 0.06,

  // Landscape, large relative to the spiral radius, so cards overlap.
  cardWidth: 2.8,
  cardHeight: 1.75,
  cardCurveDepth: 0.22, // how much each card bows outward along its width
  cardTiltJitter: 0.5, // max extra random tilt (radians) on top of facing the camera, for a scattered/tumbled feel

  cameraDistance: 6.4,
  cameraHeight: 0.4,
  cameraLookAtY: -0.1,
  cameraFov: 50,

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
