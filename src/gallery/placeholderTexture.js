import * as THREE from 'three';

// A card's image is a boundary input (hand-authored JSON today, a headless
// CMS tomorrow) — it can 404 or simply not exist yet while content is being
// prepared. Rather than let that break the ring, draw a stand-in on a
// canvas so the gallery still reads correctly.
export function createPlaceholderTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 672;
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#2b2b30');
  gradient.addColorStop(1, '#0b0b0d');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = 'rgba(214, 176, 106, 0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

  ctx.fillStyle = '#f5f3ef';
  ctx.font = '500 32px Helvetica, Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label ?? '?', canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
