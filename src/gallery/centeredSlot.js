/**
 * The hero-row (eye-level) slot currently closest to the "face camera"
 * angle (0 mod 2*PI). Only the hero row drives the overlay — the other
 * rows are wall filler above/below eye level, not something a viewer
 * reads as "the centered card".
 */
export function getCenteredSlot(slots) {
  const heroSlots = slots.filter((slot) => slot.isHeroRow);

  const angularDistance = (angle) => {
    const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return Math.min(normalized, 2 * Math.PI - normalized);
  };

  return heroSlots.reduce((closest, slot) =>
    angularDistance(slot.worldAngle) < angularDistance(closest.worldAngle) ? slot : closest
  );
}
