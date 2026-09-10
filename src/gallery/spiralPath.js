import { CONFIG } from '../config.js';

/** Total vertical span covered by `slotCount` evenly-spaced slots, in world-height units. */
export function getPeriod(slotCount) {
  return (slotCount / CONFIG.slotsPerTurn) * CONFIG.pitch;
}

/** Wraps a raw (unbounded) height into the centered range [-period/2, period/2). */
export function wrapHeight(rawY, period) {
  return (((rawY + period / 2) % period) + period) % period - period / 2;
}

/**
 * The helix itself: a single constant radius, with angle derived directly
 * from height via `pitch` (angle = height / pitch * 2*PI) — the screw
 * relationship of a real spring/coil. `y` here is already the wrapped,
 * world-space height (see wrapHeight).
 */
export function helixPointAt(y) {
  const angle = (y / CONFIG.pitch) * Math.PI * 2;
  return {
    angle,
    x: Math.sin(angle) * CONFIG.radius,
    y,
    z: Math.cos(angle) * CONFIG.radius,
  };
}

/** Smoothly fades to 0 within `CONFIG.recycleFade` (a fraction of `period`) of either edge, hiding the recycle jump. */
export function recycleFadeAt(y, period) {
  const edge = period / 2;
  const fadeZone = CONFIG.recycleFade * period;
  const distanceFromEdge = edge - Math.abs(y);
  if (distanceFromEdge < fadeZone) return Math.max(0, distanceFromEdge / fadeZone);
  return 1;
}
