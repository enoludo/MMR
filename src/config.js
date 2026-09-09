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
    tablet: 12,
    desktop: 16,
  },
  breakpoints: {
    mobile: 640,
    tablet: 1024,
  },

  // The spiral is a tunnel/vortex around the camera's own line of sight,
  // not a coil viewed from the side (see spiralPath.js for the full
  // parametrization). A slot's `t` in [0, 1) cycles continuously as the
  // scroll value advances (see SpiralGallery#update): depth and radius
  // both peak/bottom out at t=0.5 (closest to the camera, right on its
  // optical axis — genuinely screen-centered) and are at their most
  // distant right at the t=0/1 seam, exactly where recycleFade hides the
  // wrap-around jump.
  spiralTurns: 2.5,
  radiusNear: 0.25, // how far off-axis the closest card sits — small on purpose, so it's centered on screen
  radiusFar: 6.5, // how wide the tunnel opens as cards recede
  depthNear: 3, // world Z of the closest point (nearest the camera)
  depthFar: -6, // world Z of the farthest point, at the recycle seam
  recycleFade: 0.06,

  // Landscape, large relative to the near radius, so the front-most card
  // fills a good part of the frame while others recede visibly behind it.
  cardWidth: 2.6,
  cardHeight: 1.6,
  cardCurveDepth: 0.2, // how much each card bows outward along its width
  cardTiltJitter: 0.3, // max extra random tilt (radians) on top of facing the camera, for a loosely tumbled feel

  cameraDistance: 8,
  cameraHeight: 0,
  cameraLookAtZ: -1,
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
