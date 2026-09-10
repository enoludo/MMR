import * as THREE from 'three';

// 16:9, matching CONFIG.cardWidth/cardHeight — every card, whatever its
// source photo's native aspect ratio, ends up the same shape. Blur is no
// longer baked in here (see SpiralGallery's shader-based blur) so this can
// afford to be a bit crisper than the old multi-tier textures.
export const CARD_TEXTURE_SIZE = { width: 960, height: 540 };

/** Source rectangle that crops (never stretches) `source` to the canvas's aspect ratio, like CSS object-fit: cover. */
export function coverRect(source, targetAspect) {
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

/**
 * A single sharp, cover-cropped texture for a card. Depth blur is applied
 * live in the card material's fragment shader instead of being pre-baked
 * into separate tiers — see SpiralGallery for the shader injection — so
 * the transition from sharp to blurred is continuous rather than a visible
 * jump between a handful of fixed steps.
 */
export function buildCardTexture(source) {
  const canvas = document.createElement('canvas');
  canvas.width = CARD_TEXTURE_SIZE.width;
  canvas.height = CARD_TEXTURE_SIZE.height;
  const ctx = canvas.getContext('2d');

  const { sx, sy, sWidth, sHeight } = coverRect(source, canvas.width / canvas.height);
  ctx.drawImage(source, sx, sy, sWidth, sHeight, 0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
