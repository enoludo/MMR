// Keeps the page background dark and legible (the overlay text is always
// light) while still letting it read as "tinted by the current artwork":
// the sampled average color's hue/saturation survive, but its lightness is
// clamped into a narrow dark band regardless of how bright the source photo
// actually is.
const TARGET_LIGHTNESS = { min: 0.08, max: 0.16 };
const MAX_SATURATION = 0.55;

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) [r1, g1, b1] = [c, x, 0];
  else if (h < 120) [r1, g1, b1] = [x, c, 0];
  else if (h < 180) [r1, g1, b1] = [0, c, x];
  else if (h < 240) [r1, g1, b1] = [0, x, c];
  else if (h < 300) [r1, g1, b1] = [x, 0, c];
  else [r1, g1, b1] = [c, 0, x];
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

/** Plain average RGB (0-255, unrounded) of a tiny downscaled copy of `source` — cheap, since a handful of pixels is enough for an average. */
function sampleAverageRGB(source) {
  const sample = document.createElement('canvas');
  sample.width = 8;
  sample.height = 8;
  const ctx = sample.getContext('2d');
  ctx.drawImage(source, 0, 0, 8, 8);

  const { data } = ctx.getImageData(0, 0, 8, 8);
  let r = 0;
  let g = 0;
  let b = 0;
  const pixelCount = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  return { r: r / pixelCount, g: g / pixelCount, b: b / pixelCount };
}

/**
 * The page background's target color for a given card: a darkened tint of
 * that card's own average color (see sampleAverageRGB).
 */
export function extractMoodColor(source) {
  const { r, g, b } = sampleAverageRGB(source);
  const hsl = rgbToHsl(r, g, b);
  const l = Math.min(TARGET_LIGHTNESS.max, Math.max(TARGET_LIGHTNESS.min, hsl.l));
  const s = Math.min(MAX_SATURATION, hsl.s);
  return hslToRgb(hsl.h, s, l);
}

/**
 * The card's own average color, untouched by the mood tint's lightness/
 * saturation clamp above — used for the card edge (see SpiralGallery.js),
 * which should read as "this card's color", not a background-safe tint of it.
 */
export function extractAverageColor(source) {
  const { r, g, b } = sampleAverageRGB(source);
  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}
