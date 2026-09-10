import * as THREE from 'three';

// 16:9, matching CONFIG.cardWidth/cardHeight — every card, whatever its
// source photo's native aspect ratio, ends up the same shape.
const TIER_SIZE = { width: 640, height: 360 };
const BLUR_PX = { sharp: 0, soft: 10, heavy: 24 };

/** Source rectangle that crops (never stretches) `source` to the canvas's aspect ratio, like CSS object-fit: cover. */
function coverRect(source, targetAspect) {
  const width = source.naturalWidth ?? source.width;
  const height = source.naturalHeight ?? source.height;
  const sourceAspect = width / height;

  if (sourceAspect > targetAspect) {
    const cropWidth = height * targetAspect;
    return { sx: (width - cropWidth) / 2, sy: 0, sWidth: cropWidth, sHeight: height };
  }
  const cropHeight = width / targetAspect;
  return { sx: 0, sy: (height - cropHeight) / 2, sWidth: width, sHeight: cropHeight };
}

function renderTier(source, blurPx) {
  const canvas = document.createElement('canvas');
  canvas.width = TIER_SIZE.width;
  canvas.height = TIER_SIZE.height;
  const ctx = canvas.getContext('2d');
  ctx.filter = blurPx > 0 ? `blur(${blurPx}px)` : 'none';

  const { sx, sy, sWidth, sHeight } = coverRect(source, canvas.width / canvas.height);
  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

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
