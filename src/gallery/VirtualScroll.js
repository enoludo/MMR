import { CONFIG } from '../config.js';

/**
 * Drives the helix's vertical position from an unbounded "virtual" scroll
 * value instead of `window.scrollY` — the section never actually scrolls
 * (it's fixed to the viewport), so there's no page height to run out of
 * and no forced reflow from reading scroll/document metrics on every
 * event. The value is in world-height units (see spiralPath.js), the same
 * units as `CONFIG.pitch` — not radians.
 *
 * A slow constant increment is added while the user is idle, paused for a
 * short window after any wheel/touch interaction.
 *
 * Magnetic snap: whatever raw value wheel/touch deltas leave `virtualOffset`
 * at, a short debounce (`scheduleSnap`) rounds it to the nearest card's own
 * exact position (see `snapToNearestCard`) once input goes quiet — so a
 * mouse notch or a trackpad's momentum tail can never leave the helix
 * resting between two cards. The value itself just jumps to the snapped
 * target; there's no separate tween for the *visual* settle because
 * `main.js` already lerps its rendered position toward `virtualOffset`
 * every frame (`CONFIG.rotationLerp`) — that existing smoothing is what
 * makes the snap read as an eased pull into place rather than a cut.
 */
export class VirtualScroll {
  constructor(target = window) {
    this.target = target;
    this.virtualOffset = 0;
    this.isUserInteracting = false;
    this.idleTimeout = null;
    this.snapTimeout = null;
    this.lastTouchY = null;

    this.onWheel = this.onWheel.bind(this);
    this.onTouchStart = this.onTouchStart.bind(this);
    this.onTouchMove = this.onTouchMove.bind(this);
    this.onTouchEnd = this.onTouchEnd.bind(this);

    target.addEventListener('wheel', this.onWheel, { passive: true });
    target.addEventListener('touchstart', this.onTouchStart, { passive: true });
    target.addEventListener('touchmove', this.onTouchMove, { passive: true });
    target.addEventListener('touchend', this.onTouchEnd, { passive: true });
  }

  markInteraction() {
    this.isUserInteracting = true;
    clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      this.isUserInteracting = false;
    }, CONFIG.idleDelayMs);
  }

  /** Debounced so it fires once input (wheel ticks, touchmove drags) has actually gone quiet, not on every single event. */
  scheduleSnap() {
    clearTimeout(this.snapTimeout);
    this.snapTimeout = setTimeout(() => this.snapToNearestCard(), CONFIG.snapDebounceMs);
  }

  /** Cards sit exactly `pitch / slotsPerTurn` world-height units apart (see spiralPath.js) — rounding to the nearest multiple of that step is rounding to the nearest card. */
  snapToNearestCard() {
    const step = CONFIG.pitch / CONFIG.slotsPerTurn;
    this.virtualOffset = Math.round(this.virtualOffset / step) * step;
  }

  onWheel(event) {
    this.virtualOffset += event.deltaY * CONFIG.wheelSensitivity;
    this.markInteraction();
    this.scheduleSnap();
  }

  onTouchStart(event) {
    this.lastTouchY = event.touches[0]?.clientY ?? null;
    this.markInteraction();
  }

  onTouchMove(event) {
    const touchY = event.touches[0]?.clientY;
    if (touchY == null || this.lastTouchY == null) return;
    const delta = this.lastTouchY - touchY;
    this.virtualOffset += delta * CONFIG.touchSensitivity;
    this.lastTouchY = touchY;
    this.markInteraction();
    this.scheduleSnap();
  }

  onTouchEnd() {
    this.lastTouchY = null;
    this.markInteraction();
    this.scheduleSnap();
  }

  /** Advance the target scroll height by the idle auto-scroll speed, if idle. */
  tick() {
    if (!this.isUserInteracting) {
      this.virtualOffset += CONFIG.autoRotateSpeed;
    }
    return this.virtualOffset;
  }

  dispose() {
    clearTimeout(this.idleTimeout);
    clearTimeout(this.snapTimeout);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('touchstart', this.onTouchStart);
    this.target.removeEventListener('touchmove', this.onTouchMove);
    this.target.removeEventListener('touchend', this.onTouchEnd);
  }
}
