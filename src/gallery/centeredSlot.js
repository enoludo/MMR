const MIN_OPACITY = 0.6; // ignore slots still fading in/out at the recycle point
const FRUSTUM_MARGIN = 0.85; // NDC space [-1, 1]; a slot outside this is off-screen (or too close to the edge)

function isOnScreen(slot, camera) {
  const ndc = slot.mesh.position.clone().project(camera);
  return Math.abs(ndc.x) < FRUSTUM_MARGIN && Math.abs(ndc.y) < FRUSTUM_MARGIN;
}

/**
 * The slot currently reading as "centered" to the viewer. Because a
 * card's angle is derived directly from its height (angle = height /
 * pitch * 2*PI — see spiralPath.js), "facing the camera" and "at the
 * camera's own height" are the same condition: whichever visible,
 * on-screen slot has the smallest |height| is both the closest card and
 * the one dead-center on screen.
 */
export function getCenteredSlot(slots, camera) {
  const fullyVisible = slots.filter((slot) => slot.frontMaterial.opacity >= MIN_OPACITY);
  const onScreen = fullyVisible.filter((slot) => isOnScreen(slot, camera));
  const pool = onScreen.length > 0 ? onScreen : fullyVisible.length > 0 ? fullyVisible : slots;

  return pool.reduce((closest, slot) =>
    Math.abs(slot.mesh.position.y) < Math.abs(closest.mesh.position.y) ? slot : closest
  );
}
