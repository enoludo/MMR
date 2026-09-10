// Central tuning knobs for the spiral gallery.
// Slots are purely visual placeholders in 3D space; the data (cards.json)
// is mapped onto them independently (see SpiralGallery#buildSlots).
export const CONFIG = {
  // The spiral is a true helix, like a spring/coil: a single constant
  // `radius`, with angle and height rigidly tied together by `pitch` (the
  // height gained per full turn) — angle = height / pitch * 2*PI. That
  // screw relationship is what makes this feel like a spring sliding
  // vertically as you scroll rather than a ring spinning in place: moving
  // every card's height by one `pitch` is exactly equivalent to nothing
  // moving at all, since it lines each card back up with its neighbor's
  // old angle. That equivalence is also what makes "infinite scroll"
  // possible without a growing/shrinking radius: recycling a card from
  // one end of the visible span to the other, `slotsPerTurn` full turns
  // away, is seamless because both its height and its angle land exactly
  // where a neighboring card already was.
  //
  // Because angle is derived from height, a card's angle and its height
  // can never disagree — so "closest to the camera" (angle ~ 0) and
  // "vertically centered" (height ~ 0, matching the camera's own height)
  // are one and the same card. And because radius never changes, cards
  // are evenly spaced by construction (angularly within a turn, and
  // vertically between turns), which is what keeps them from ever
  // clipping into each other.
  // Radius bumped up alongside slotsPerTurn: 10 cards/turn means a tighter
  // 36° angular step, so the radius grows too to keep the chord spacing
  // between adjacent cards comfortably wider than cardWidth (unchanged) —
  // otherwise they'd clip into each other at the old radius.
  radius: 5.2,
  pitch: 3.3, // +50% over the previous 2.2
  slotsPerTurn: 10,
  turnsRendered: 5, // total slots = slotsPerTurn * turnsRendered; only ~2-3 turns are ever actually in frame — the rest is buffer so the recycle point (see below) stays off-screen

  breakpoints: {
    mobile: 640,
    tablet: 1024,
  },

  cardWidth: 2.6,
  cardHeight: 1.5,

  // A flat, near-eye-level camera — barely raised or tilted — so the
  // helix reads as cards sliding past at varying depth, not as a cone's
  // visible side silhouette.
  cameraDistance: 9.5, // radius + ~4.3, matching the previous distance-to-front so cards stay the same apparent size
  cameraHeight: 0,
  cameraLookAtY: 0,
  cameraFov: 46,

  // Depth cueing: each card's texture is pre-blurred once into three
  // tiers (see textureTiers.js) and swapped based on live angular
  // distance from the front, cheaper and more reliable than a real-time
  // depth-of-field render pass.
  sharpAngleDeg: 20,
  softAngleDeg: 50,

  // How close to the top/bottom of the rendered span (see `turnsRendered`)
  // a card starts fading out before it recycles to the opposite end —
  // belt-and-suspenders on top of that span already keeping the recycle
  // point off-screen.
  recycleFade: 0.08,

  // Virtual scroll (see VirtualScroll.js). Never bound to window.scrollY.
  // Values are in world-height units (the same units as `pitch`), not
  // radians: the whole helix visibly translates vertically as this
  // accumulates.
  wheelSensitivity: 0.0026,
  touchSensitivity: 0.007,
  rotationLerp: 0.08,
  autoRotateSpeed: 0.0009,
  idleDelayMs: 1500,
};

export function getSlotCountForWidth(width) {
  const turns =
    width <= CONFIG.breakpoints.mobile ? 3 : width <= CONFIG.breakpoints.tablet ? 4 : CONFIG.turnsRendered;
  return CONFIG.slotsPerTurn * turns;
}
