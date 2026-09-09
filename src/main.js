import cardsData from './data/cards.json';
import { CONFIG } from './config.js';
import { SpiralGallery } from './gallery/SpiralGallery.js';
import { VirtualScroll } from './gallery/VirtualScroll.js';
import { Overlay } from './gallery/Overlay.js';
import { getCenteredSlotIndex } from './gallery/centeredSlot.js';

const canvasContainer = document.getElementById('gallery-canvas');

const gallery = new SpiralGallery({ container: canvasContainer, cardsData });
const virtualScroll = new VirtualScroll(window);
const overlay = new Overlay({
  titleEl: document.getElementById('card-title'),
  ctaEl: document.getElementById('card-cta'),
});

let currentRotation = 0;

function updateCenteredCard() {
  const slotIndex = getCenteredSlotIndex(currentRotation, gallery.slotCount);
  const card = cardsData[slotIndex % cardsData.length];
  overlay.setCard(card);
}

function animate() {
  requestAnimationFrame(animate);

  const targetRotation = virtualScroll.tick();
  currentRotation += (targetRotation - currentRotation) * CONFIG.rotationLerp;

  gallery.setRotation(currentRotation);
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
