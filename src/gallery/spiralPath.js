import { CONFIG } from '../config.js';

/**
 * The spiral curve itself: angle grows continuously over `spiralTurns`
 * revolutions while radius and height grow monotonically alongside it, for
 * t in [0, 1). This is a real spiral (not periodic in angle), so it can't
 * be spun as one rigid ring — see SpiralGallery#update for how slots flow
 * along it instead.
 */
export function spiralPointAt(t) {
  const angle = t * CONFIG.spiralTurns * Math.PI * 2;
  const radius = CONFIG.radiusMin + t * (CONFIG.radiusMax - CONFIG.radiusMin);
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
