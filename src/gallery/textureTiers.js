import * as THREE from 'three';

const TIER_SIZE = { width: 640, height: 437 };
const BLUR_PX = { sharp: 0, soft: 10, heavy: 24 };

function renderTier(source, blurPx) {
  const canvas = document.createElement('canvas');
  canvas.width = TIER_SIZE.width;
  canvas.height = TIER_SIZE.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/**
 * Three pre-baked blur levels of the same image, swapped per-frame based on
 * how far a card sits from the centered column (see SpiralGallery#update).
 * Baking the blur once via Canvas2D — rather than a real-time WebGL
 * depth-of-field pass — keeps it cheap and visually reliable across
 * devices, independent of the 3D scene's exact depth values.
 */
export function buildTextureTiers(source) {
  return {
    sharp: renderTier(source, BLUR_PX.sharp),
    soft: renderTier(source, BLUR_PX.soft),
    heavy: renderTier(source, BLUR_PX.heavy),
  };
}
