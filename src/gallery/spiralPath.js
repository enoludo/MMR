import { CONFIG } from '../config.js';

/**
 * The spiral is a tunnel/vortex around the camera's own line of sight
 * (the Z axis), not a coil viewed from the side. A slot's `t` in [0, 1)
 * drives three things at once, all peaking or bottoming out at t = 0.5:
 *
 *  - depth (z): far away at the seam (t=0/1), closest to the camera at
 *    t=0.5 — so a card travels toward the viewer then back into the
 *    distance, rather than just receding one-way.
 *  - radius: wide (far from the tunnel's axis) at the seam, shrinking to
 *    near-zero at t=0.5 — so the closest, most prominent card sits right
 *    on the camera's optical axis, which is exactly screen-center. This
 *    also avoids a cone silhouette: viewed down the axis, a shrinking
 *    radius reads as a vortex closing in, not a cone's flared side profile.
 *  - angle: keeps spinning continuously over `spiralTurns`, independent of
 *    the above, so the tunnel visibly twists as cards travel through it.
 *
 * The recycle seam (see recycleFadeAt) sits at t=0/1, i.e. exactly where a
 * slot is already far, wide and about to fade — never at the prominent,
 * on-axis moment.
 */
export function spiralPointAt(t) {
  const angle = t * CONFIG.spiralTurns * Math.PI * 2;

  // 0 at t=0/1 (the far, wide seam), 1 at t=0.5 (the near, on-axis peak).
  const approach = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);

  const radius = CONFIG.radiusFar - (CONFIG.radiusFar - CONFIG.radiusNear) * approach;
  const z = CONFIG.depthFar + (CONFIG.depthNear - CONFIG.depthFar) * approach;

  return {
    angle,
    x: Math.cos(angle) * radius,
    y: Math.sin(angle) * radius,
    z,
  };
}

/** Smoothly fades to 0 within `CONFIG.recycleFade` of either end of [0, 1), hiding the wrap-around jump. */
export function recycleFadeAt(t) {
  const fade = CONFIG.recycleFade;
  if (t < fade) return t / fade;
  if (t > 1 - fade) return (1 - t) / fade;
  return 1;
}
