function angularDistanceToZero(angle) {
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.min(normalized, 2 * Math.PI - normalized);
}

const MIN_OPACITY = 0.6; // ignore slots still fading in/out at the recycle seam
const FRUSTUM_MARGIN = 0.85; // NDC space [-1, 1]; a slot outside this is off-screen (or too close to the edge)

// With more than one turn, several slots can share an angle close to 0 at
// once, on different loops of the spiral — at very different radius/height.
// Angle alone can't tell those apart: one may sit dead center on screen
// while another, at the same angle but a further loop, is swung up or down
// off-screen entirely. Filtering to what's actually visible first is what
// makes "closest angle" mean "the card the viewer is looking at".
function isOnScreen(slot, camera) {
  const ndc = slot.mesh.position.clone().project(camera);
  return Math.abs(ndc.x) < FRUSTUM_MARGIN && Math.abs(ndc.y) < FRUSTUM_MARGIN;
}

/**
 * The slot currently reading as "centered" to the viewer: on screen, fully
 * visible (not mid recycle-fade), and with the smallest angular offset from
 * dead-center (0 mod 2*PI) among those.
 */
export function getCenteredSlot(slots, camera) {
  const fullyVisible = slots.filter((slot) => slot.mesh.material.opacity >= MIN_OPACITY);
  const onScreen = fullyVisible.filter((slot) => isOnScreen(slot, camera));
  const pool = onScreen.length > 0 ? onScreen : fullyVisible.length > 0 ? fullyVisible : slots;

  return pool.reduce((closest, slot) =>
    angularDistanceToZero(slot.angle) < angularDistanceToZero(closest.angle) ? slot : closest
  );
}
