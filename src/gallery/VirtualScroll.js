import { CONFIG } from '../config.js';

/**
 * Drives the helix's vertical position from an unbounded "virtual" scroll
 * value instead of `window.scrollY` — the section never actually scrolls
 * (it's fixed to the viewport), so there's no page height to run out of
 * and no forced reflow from reading scroll/document metrics on every
 * event. The value is in world-height units (see spiralPath.js), the same
 * units as `CONFIG.pitch` — not radians.
 *
 * Two independent inputs feed it: `wheel` (mouse wheel/trackpad, on
 * `wheelTarget`) and a horizontal pointer drag (mouse click-drag or a touch
 * slide, both handled identically via the Pointer Events API, scoped to
 * `dragTarget` so it never hijacks clicks on the header or the CTA — those
 * live outside `dragTarget`'s subtree, so a pointerdown on them never
 * reaches this class at all). Dragging left advances the helix forward,
 * the same direction a downward wheel/swipe already did — one consistent
 * "forward" gesture across every input.
 *
 * A slow constant increment is added while the user is idle, paused for a
 * short window after any wheel/drag interaction.
 *
 * Magnetic snap: whatever raw value wheel/drag deltas leave `virtualOffset`
 * at, a short debounce (`scheduleSnap`) rounds it to the nearest card's own
 * exact position (see `snapToNearestCard`) once input goes quiet — so a
 * mouse notch, a trackpad's momentum tail, or a released drag can never
 * leave the helix resting between two cards. The value itself just jumps to
 * the snapped target; there's no separate tween for the *visual* settle
 * because `main.js` already lerps its rendered position toward
 * `virtualOffset` every frame (`CONFIG.rotationLerp`) — that existing
 * smoothing is what makes the snap read as an eased pull into place rather
 * than a cut.
 */
export class VirtualScroll {
  constructor({ wheelTarget = window, dragTarget = wheelTarget } = {}) {
    this.wheelTarget = wheelTarget;
    this.dragTarget = dragTarget;
    this.virtualOffset = 0;
    this.isUserInteracting = false;
    this.idleTimeout = null;
    this.snapTimeout = null;
    this.isDragging = false;
    this.lastDragX = null;

    this.onWheel = this.onWheel.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    wheelTarget.addEventListener('wheel', this.onWheel, { passive: true });
    // Started on dragTarget (so a press on the header/CTA never counts —
    // they sit outside it in the DOM) but tracked on window from then on,
    // so the drag keeps following the pointer even past dragTarget's edges.
    dragTarget.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
  }

  markInteraction() {
    this.isUserInteracting = true;
    clearTimeout(this.idleTimeout);
    this.idleTimeout = setTimeout(() => {
      this.isUserInteracting = false;
    }, CONFIG.idleDelayMs);
  }

  /** Debounced so it fires once input (wheel ticks, drag moves) has actually gone quiet, not on every single event. */
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

  onPointerDown(event) {
    // `isPrimary` excludes extra touch points in a multi-touch gesture;
    // for mouse/pen, restrict to the primary (left) button so e.g. a
    // right-click-drag doesn't scroll the gallery.
    if (!event.isPrimary || (event.pointerType !== 'touch' && event.button !== 0)) return;
    this.isDragging = true;
    this.lastDragX = event.clientX;
    // Keeps delivering move/up events to this pointer even if it strays
    // outside dragTarget mid-drag (a fast mouse drag easily does).
    this.dragTarget.setPointerCapture?.(event.pointerId);
    this.markInteraction();
  }

  onPointerMove(event) {
    if (!this.isDragging) return;
    const delta = this.lastDragX - event.clientX;
    this.virtualOffset += delta * CONFIG.dragSensitivity;
    this.lastDragX = event.clientX;
    this.markInteraction();
    this.scheduleSnap();
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.lastDragX = null;
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
    this.wheelTarget.removeEventListener('wheel', this.onWheel);
    this.dragTarget.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
  }
}
