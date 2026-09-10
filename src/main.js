import cardsData from './data/cards.json';
import { CONFIG } from './config.js';
import { SpiralGallery } from './gallery/SpiralGallery.js';
import { VirtualScroll } from './gallery/VirtualScroll.js';
import { Overlay } from './gallery/Overlay.js';
import { BackgroundTint } from './gallery/BackgroundTint.js';
import { getCenteredSlot } from './gallery/centeredSlot.js';
import { initHeader } from './gallery/Header.js';

initHeader();

const canvasContainer = document.getElementById('gallery-canvas');

const gallery = new SpiralGallery({ container: canvasContainer, cardsData });
const virtualScroll = new VirtualScroll({ wheelTarget: window, dragTarget: canvasContainer });
const overlay = new Overlay({
  titleEl: document.getElementById('card-title'),
  ctaEl: document.getElementById('card-cta'),
});
// Matches style.css's static `body { background }`, so the very first
// transition (once the front card's mood color is known) starts from the
// same color that was already on screen.
const backgroundTint = new BackgroundTint(document.body, { r: 24, g: 20, b: 16 });

let currentScrollY = 0;

function updateCenteredCard() {
  const slot = getCenteredSlot(gallery.slots, gallery.camera);
  const card = cardsData[slot.index % cardsData.length];
  overlay.setCard(card);
  backgroundTint.setCard(card, gallery.cardColors.get(card.id));
}

function animate() {
  requestAnimationFrame(animate);

  const targetScrollY = virtualScroll.tick();
  currentScrollY += (targetScrollY - currentScrollY) * CONFIG.rotationLerp;

  gallery.update(currentScrollY);
  updateCenteredCard();
  gallery.render();
}

animate();

// Resize is handled only on the `resize` event, never per-frame, to avoid
// the layout-thrashing/reflow issues from the previous scroll-bound approach.
let resizeRaf = null;
window.addEventListener('resize', () => {
  if (resizeRaf) cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => {
    gallery.resize();
    gallery.refreshSlotCountForWidth(window.innerWidth);
  });
});
