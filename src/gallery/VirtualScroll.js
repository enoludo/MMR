import { CONFIG } from '../config.js';

/**
 * Drives the spiral's progress from an unbounded "virtual" scroll value
 * instead of `window.scrollY` — the section never actually scrolls (it's
 * fixed to the viewport), so there's no page height to run out of and no
 * forced reflow from reading scroll/document metrics on every event. The
 * value is in spiral-progress units (see spiralPath.js), not radians.
 *
 * A slow constant increment is added while the user is idle, paused for a
 * short window after any wheel/touch interaction.
 */
export class VirtualScroll {
  constructor(target = window) {
    this.target = target;
    this.virtualOffset = 0;
    this.isUserInteracting = false;
    this.idleTimeout = null;
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

  onWheel(event) {
    this.virtualOffset += event.deltaY * CONFIG.wheelSensitivity;
    this.markInteraction();
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
  }

  onTouchEnd() {
    this.lastTouchY = null;
    this.markInteraction();
  }

  /** Advance the target spiral progress by the idle auto-rotate speed, if idle. */
  tick() {
    if (!this.isUserInteracting) {
      this.virtualOffset += CONFIG.autoRotateSpeed;
    }
    return this.virtualOffset;
  }

  dispose() {
    clearTimeout(this.idleTimeout);
    this.target.removeEventListener('wheel', this.onWheel);
    this.target.removeEventListener('touchstart', this.onTouchStart);
    this.target.removeEventListener('touchmove', this.onTouchMove);
    this.target.removeEventListener('touchend', this.onTouchEnd);
  }
}
