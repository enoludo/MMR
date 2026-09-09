const MIN_OPACITY = 0.6; // ignore slots still fading in/out at the recycle seam

/**
 * The slot currently reading as "centered": in the tunnel parametrization
 * (see spiralPath.js), every slot's radius shrinks to (near) zero exactly
 * at t = 0.5 — the moment it sits right on the camera's optical axis, i.e.
 * genuinely at screen-center, not just facing the camera from off to one
 * side. So "centered" is simply whichever fully-visible slot has its `t`
 * closest to 0.5.
 */
export function getCenteredSlot(slots) {
  const visible = slots.filter((slot) => slot.mesh.material.opacity >= MIN_OPACITY);
  const pool = visible.length > 0 ? visible : slots;

  return pool.reduce((closest, slot) =>
    Math.abs(slot.t - 0.5) < Math.abs(closest.t - 0.5) ? slot : closest
  );
}
