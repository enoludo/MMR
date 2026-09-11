import { CONFIG } from '../config.js';

// How far apart (in world-height units) the two probe points are when
// numerically estimating the anchor's screen-space speed (see
// #dragUnitsPerPixel) — small enough to be a good local derivative, far
// enough above floating-point noise given world coordinates a few units wide.
const ANCHOR_PROBE_EPS = 0.001;

/** Cards sit exactly this far apart, in world-height units (see spiralPath.js). */
function cardStep() {
  return CONFIG.pitch / CONFIG.slotsPerTurn;
}

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
 * A drag doesn't move `virtualOffset` at some fixed, disconnected rate: if
 * `pickDragAnchor`/`anchorScreenX` are supplied (see SpiralGallery, which
 * implements both), whatever point of whatever card was actually grabbed on
 * pointerdown keeps tracking the cursor 1:1 for the rest of the gesture —
 * grab a card by a corner and that corner, not just the card's center,
 * stays under the pointer. `CONFIG.dragSensitivity` only applies as a
 * fallback, when the drag started over empty space with no card to anchor to.
 *
 * A slow constant increment is added while the user is idle, paused for a
 * short window after any wheel/drag interaction.
 *
 * Magnetic snap: whatever raw value wheel ticks or a released drag leave
 * `virtualOffset` at, a short debounce (`scheduleSnap`) rounds it to the
 * nearest card's own exact position (see `snapToNearestCard`) once input
 * goes quiet — so a mouse notch, a trackpad's momentum tail, or a released
 * drag can never leave the helix resting between two cards. Never scheduled
 * from `onPointerMove` itself, only `onWheel`/`onPointerUp`: snapping while
 * the pointer is still held down would yank whatever was grabbed out from
 * under a hand that's merely paused mid-drag, not released it. The value
 * itself just jumps to the snapped target; there's no separate tween for
 * the *visual* settle because `main.js` already lerps its rendered position
 * toward `virtualOffset` every frame (`CONFIG.rotationLerp`) — that existing
 * smoothing is what makes the snap read as an eased pull into place rather
 * than a cut.
 */
export class VirtualScroll {
  constructor({ wheelTarget = window, dragTarget = wheelTarget, pickDragAnchor, anchorScreenX } = {}) {
    this.wheelTarget = wheelTarget;
    this.dragTarget = dragTarget;
    this.pickDragAnchor = pickDragAnchor;
    this.anchorScreenX = anchorScreenX;
    this.virtualOffset = 0;
    this.isUserInteracting = false;
    this.idleTimeout = null;
    this.snapTimeout = null;
    this.isDragging = false;
    this.lastDragX = null;
    this.dragAnchor = null;

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

  /** Rounding to the nearest multiple of a card's own step is rounding to the nearest card. */
  snapToNearestCard() {
    const step = cardStep();
    this.virtualOffset = Math.round(this.virtualOffset / step) * step;
  }

  /**
   * Steps by exactly one card, for the prev/next arrow controls — `+1`
   * advances (the card currently sitting to the right becomes centered),
   * `-1` retreats (the one on the left becomes centered). See
   * SliderControls.js for why that mapping is this way round: increasing
   * `virtualOffset` is the same direction a leftward drag already moves
   * things, which pulls in whatever was on the right.
   *
   * Rounds to the nearest card *first*, then steps from there — rather than
   * just adding a step to whatever `virtualOffset` currently is — so this
   * always lands exactly centered even if the current value was already a
   * little off-grid (idle auto-rotate drifts continuously, and a wheel/drag
   * gesture's own magnetic snap is debounced, so it may not have caught up
   * yet). Without this, clicking an arrow while off-grid would carry that
   * same offset into the result and land between two cards instead of on one.
   */
  stepToAdjacentCard(direction) {
    const step = cardStep();
    const currentIndex = Math.round(this.virtualOffset / step);
    this.virtualOffset = (currentIndex + direction) * step;
    this.markInteraction();
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
    this.dragAnchor = this.pickDragAnchor?.(event.clientX, event.clientY) ?? null;
    // Keeps delivering move/up events to this pointer even if it strays
    // outside dragTarget mid-drag (a fast mouse drag easily does).
    this.dragTarget.setPointerCapture?.(event.pointerId);
    this.markInteraction();
  }

  /**
   * How much `virtualOffset` should change per CSS pixel the pointer just
   * moved, so that whatever was grabbed on pointerdown (see `dragAnchor`)
   * keeps tracking the cursor. Estimated by nudging `virtualOffset` a tiny
   * amount each way and seeing how far the anchor's projected screen X
   * moves — the local slope of screen-X vs. scroll, at the anchor's current
   * position, not some flat global rate: as the card carrying that anchor
   * moves, curves, tilts, and scales along the helix, this speed changes
   * with it, so recomputing it on every move (not just once, at pointerdown)
   * is what keeps the tracking accurate for the whole gesture. Falls back
   * to the fixed `CONFIG.dragSensitivity` when nothing was grabbed (the drag
   * started over empty space) or the estimate is degenerate.
   */
  dragUnitsPerPixel() {
    if (!this.dragAnchor || !this.anchorScreenX) return -CONFIG.dragSensitivity;
    const lo = this.anchorScreenX(this.dragAnchor, this.virtualOffset - ANCHOR_PROBE_EPS);
    const hi = this.anchorScreenX(this.dragAnchor, this.virtualOffset + ANCHOR_PROBE_EPS);
    const pxPerUnit = (hi - lo) / (2 * ANCHOR_PROBE_EPS);
    if (!Number.isFinite(pxPerUnit) || Math.abs(pxPerUnit) < 1e-6) return -CONFIG.dragSensitivity;
    return 1 / pxPerUnit;
  }

  onPointerMove(event) {
    if (!this.isDragging) return;
    const cursorDeltaPx = event.clientX - this.lastDragX;
    this.virtualOffset += cursorDeltaPx * this.dragUnitsPerPixel();
    this.lastDragX = event.clientX;
    this.markInteraction();
    // Deliberately no scheduleSnap() here: while the pointer is still down,
    // a paused-but-still-dragging hand should never have the card yanked
    // out from under it into a snapped position. Only releasing (below)
    // schedules the debounce that eventually snaps.
  }

  onPointerUp() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.lastDragX = null;
    this.dragAnchor = null;
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
