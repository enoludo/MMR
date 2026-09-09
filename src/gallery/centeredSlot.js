/** Index of the slot currently closest to the "face camera" angle (0 mod 2*PI). */
export function getCenteredSlotIndex(currentRotation, totalSlots) {
  const anglePerSlot = (2 * Math.PI) / totalSlots;
  const normalized =
    ((-currentRotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return Math.round(normalized / anglePerSlot) % totalSlots;
}
