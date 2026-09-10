import { CONFIG } from '../config.js';

/**
 * The spiral curve itself: angle grows continuously over `spiralTurns`
 * revolutions while height grows monotonically alongside it (a real
 * ascending/descending spiral, not periodic). Radius, by contrast, *is*
 * periodic in angle — largest at the front (angle = 0) and smallest at
 * the back (angle = PI), every single loop — so the card currently facing
 * the camera is always the closest one, and cards visibly recede toward
 * the back as they rotate away from front. For t in [0, 1); this is not
 * periodic in t (because of height), so it can't be spun as one rigid
 * ring — see SpiralGallery#update for how slots flow along it instead.
 */
export function spiralPointAt(t) {
  const angle = t * CONFIG.spiralTurns * Math.PI * 2;
  const radius = CONFIG.radiusBase + CONFIG.radiusAmplitude * Math.cos(angle);
  const y = CONFIG.heightStart + t * (CONFIG.heightEnd - CONFIG.heightStart);
  return {
    angle,
    x: Math.sin(angle) * radius,
    y,
    z: Math.cos(angle) * radius,
  };
}

/** Smoothly fades to 0 within `CONFIG.recycleFade` of either end of [0, 1), hiding the wrap-around jump. */
export function recycleFadeAt(t) {
  const fade = CONFIG.recycleFade;
  if (t < fade) return t / fade;
  if (t > 1 - fade) return (1 - t) / fade;
  return 1;
}
