/**
 * Wires the prev/next arrow buttons (Figma's "SliderControls" block) to
 * step the helix by exactly one card. "Left" and "right" here are literal:
 * left goes to whichever card currently sits to the left of center, right
 * to the one on the right (see VirtualScroll#stepToAdjacentCard for the
 * direction mapping). The value jumps straight to its new target — no
 * tween here either — since main.js's existing per-frame lerp toward
 * `virtualOffset` is what animates the visible transition, the same way it
 * already does for wheel/drag input.
 */
export function initSliderControls(virtualScroll) {
  document.getElementById('slider-prev')?.addEventListener('click', () => {
    virtualScroll.stepToAdjacentCard(-1);
  });
  document.getElementById('slider-next')?.addEventListener('click', () => {
    virtualScroll.stepToAdjacentCard(1);
  });
}
