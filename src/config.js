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

  cardWidth: 2.56,
  cardHeight: 1.44, // exactly 16:9

  // Rounds every corner of the card, edges included — it's an actual
  // geometry radius (the card shape is extruded from a rounded rectangle,
  // see SpiralGallery.js), not a shader trick, so the edge faces follow
  // the same curve as the front/back instead of just having their square
  // corners masked away. There's no single px-to-world-unit ratio in a 3D
  // scene — apparent size depends on viewport width and camera distance —
  // so this is calibrated to read as ~8px on the frontmost card at a
  // typical (~1400px-wide) desktop viewport, not an exact px value at
  // every size.
  cardCornerRadius: 0.0325,

  // Every card is rolled by this fixed amount around its own line of sight
  // (in the same rotational sense the helix itself turns as height
  // increases), so the coil reads as a continuous, slightly banked ribbon
  // rather than a stack of flat, perfectly upright rectangles.
  cardTiltDeg: 4,

  // A flat, near-eye-level camera — barely raised or tilted — so the
  // helix reads as cards sliding past at varying depth, not as a cone's
  // visible side silhouette.
  cameraDistance: 9.5, // radius + ~4.3, matching the previous distance-to-front so cards stay the same apparent size
  cameraHeight: 0,
  cameraLookAtY: 0,
  cameraFov: 46,

  // Depth cueing: a live shader blur (see SpiralGallery's onBeforeCompile
  // hook) grows continuously with a card's angular distance from the
  // front, rather than snapping between a handful of pre-baked tiers —
  // cards this close to the front stay perfectly sharp, cards this far
  // are at maximum blur, and everything in between is a smooth ramp.
  blurStartDeg: 15,
  blurFullDeg: 85,
  maxBlurTexels: 12,

  // Depth-based transparency: cards fade from fully opaque at the front
  // (angle ~ 0, closest to the camera) to nearly transparent at the back
  // (angle ~ 180°, farthest away), reinforcing the sense of depth beyond
  // the blur tiers above.
  frontOpacity: 1,
  backOpacity: 0.1,

  // The centered card grows to this scale, smoothly ramping up as it
  // enters the central zone and back down to 1 as it leaves — see
  // centeredScaleAngleDeg, the angular half-width of that zone. Half the
  // 36° angular step between cards at slotsPerTurn=10, so one card is
  // back at scale 1 right as its neighbor's own zone begins.
  centeredScale: 1.2,
  centeredScaleAngleDeg: 18,

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
