// Central tuning knobs for the spiral gallery.
// Slots are purely visual placeholders in 3D space; the data (cards.json)
// is mapped onto them independently (see SpiralGallery#buildSlots).
export const CONFIG = {
  // Columns wrapped around the cylinder. Decoupled from the number of
  // cards: with 4 cards and 16 columns each card repeats 4 times around
  // the wall; adding cards to cards.json never requires touching this.
  columnCount: {
    mobile: 10,
    tablet: 14,
    desktop: 18,
  },
  // Rows stacked in each column, extending above and below the viewport —
  // it's a tall wall of photos, not a single ring.
  rowCount: 4,
  rowSpacing: 1.7,
  breakpoints: {
    mobile: 640,
    tablet: 1024,
  },

  // A true cylinder (constant radius), so it's periodic in angle and can
  // be spun as one rigid group forever with no seam — unlike a real
  // Archimedean/conical spiral, there's no wrap-around jump to hide.
  radius: 6.5,

  cardWidth: 2,
  cardHeight: 1.35,

  // Distance and FOV tuned so several full columns are visible across the
  // screen at once (a wall, not one card filling the frame).
  cameraDistance: 10.5,
  cameraHeight: 0.4,
  cameraFov: 58,

  // Virtual scroll (see VirtualScroll.js). Never bound to window.scrollY.
  // Values are in radians applied directly to the wall's rotation.
  wheelSensitivity: 0.0022,
  touchSensitivity: 0.006,
  rotationLerp: 0.08,
  autoRotateSpeed: 0.0007,
  idleDelayMs: 1500,
};

export function getColumnCountForWidth(width) {
  if (width <= CONFIG.breakpoints.mobile) return CONFIG.columnCount.mobile;
  if (width <= CONFIG.breakpoints.tablet) return CONFIG.columnCount.tablet;
  return CONFIG.columnCount.desktop;
}
