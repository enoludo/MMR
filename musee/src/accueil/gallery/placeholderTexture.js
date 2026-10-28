import * as THREE from 'three';

// Deterministic pseudo-random in [0, 1) from a string, so the same missing
// card always gets the same stand-in instead of a different one per reload.
function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return (h % 1000) / 1000;
}

const PALETTES = [
  ['#7dd8d0', '#2f6f8f', '#0d1b2e'],
  ['#5b3fc4', '#2f2fbf', '#0d0d1a'],
  ['#f2c265', '#d98a3a', '#241608'],
  ['#d7f26a', '#3fae8f', '#0a1f1a'],
];

// A card's image is a boundary input (hand-authored JSON today, a headless
// CMS tomorrow) — it can 404 or simply not exist yet while content is being
// prepared. Rather than let that break the gallery, draw a vivid stand-in
// on a canvas, in the same spirit as the real artwork it replaces.
export function createPlaceholderTexture(label) {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900; // 16:9, matching CONFIG.cardWidth/cardHeight
  const ctx = canvas.getContext('2d');

  const palette = PALETTES[Math.floor(hashString(label ?? '') * PALETTES.length)];
  const gradient = ctx.createRadialGradient(
    canvas.width * 0.35, canvas.height * 0.3, 0,
    canvas.width * 0.35, canvas.height * 0.3, canvas.width * 0.7
  );
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.5, palette[1]);
  gradient.addColorStop(1, palette[2]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = palette[2];
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.arc(canvas.width * 0.72, canvas.height * 0.6, 180, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#f5f3ef';
  ctx.font = '500 44px Helvetica, Arial, sans-serif';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label ?? '?', 60, canvas.height - 60);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
