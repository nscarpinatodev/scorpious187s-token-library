/**
 * Image compositing.
 *
 * This used to drive Tokenizer 2's headless exportLayers() with hand-built mask
 * entries. That was a mistake: its custom-mask path composites by a rule this
 * module cannot see, and Tokenizer's own dynamic-ring masks are pure black with
 * an alpha channel — RGBA(0,0,0,255) inside the circle, (0,0,0,0) outside — so
 * anything treating them as luminance erases the entire subject.
 *
 * What we actually need is one well-defined canvas operation, so it is done
 * here where the semantics are explicit:
 *
 *   destination-in keeps destination pixels wherever the SOURCE ALPHA is
 *   non-zero. Painting the mask in that mode clips the art to the mask's opaque
 *   region — which is exactly right for the verified mask assets, and for any
 *   other mask drawn the same way.
 *
 * Tokenizer 2 is still the authoring tool (the editor round-trip on import, and
 * its frame browser); it is simply no longer in the bulk-processing path.
 */

import { MASK_MODES, SUBJECT_FITS, SUBJECT_THICKNESS } from '../constants.js';
import { encodePath } from '../storage/paths.js';
import { log } from '../logger.js';

/**
 * Load an image element from a Foundry-served path.
 *
 * crossOrigin is set so a library hosted on S3 or a Forge asset library does
 * not taint the canvas — those buckets must send CORS headers or toBlob() will
 * throw a SecurityError.
 * @param {string} src
 * @returns {Promise<HTMLImageElement>}
 */
export async function loadImage(src) {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.src = foundry.utils.getRoute(encodePath(src));
  await image.decode();
  return image;
}

/**
 * Draw an image into a square, preserving aspect ratio.
 *
 * `contain` fits the whole image; `cover` fills the square and crops the
 * overflow; `cover-top` does the same but keeps the top edge, which is where a
 * standing portrait's face is.
 */
function drawFitted(ctx, image, size, fit) {
  const w = image.naturalWidth || image.width;
  const h = image.naturalHeight || image.height;
  if (!w || !h) return;

  if (fit === SUBJECT_FITS.CONTAIN) {
    const scale = Math.min(size / w, size / h);
    const dw = w * scale;
    const dh = h * scale;
    ctx.drawImage(image, (size - dw) / 2, (size - dh) / 2, dw, dh);
    return;
  }

  const scale = Math.max(size / w, size / h);
  const dw = w * scale;
  const dh = h * scale;
  ctx.drawImage(
    image,
    (size - dw) / 2,
    fit === SUBJECT_FITS.COVER_TOP ? 0 : (size - dh) / 2,
    dw,
    dh,
  );
}

/**
 * Produce a processed token image.
 *
 * Order matters: the subject is clipped first, then the frame is laid over the
 * result, so a frame's border is never eaten by the mask.
 *
 * @param {string} artSrc Source artwork path.
 * @param {object} options
 * @param {string|null} [options.frameSrc]  Frame drawn over the clipped art.
 * @param {string} [options.maskMode]       'circle' | 'image' | 'none'
 * @param {string|null} [options.maskSrc]   Mask image, when maskMode is 'image'.
 * @param {string} [options.fit]            'cover-top' | 'cover' | 'contain'
 * @param {number} [options.size=512]       Output edge length in pixels.
 * @param {string} [options.format='webp']  'webp' | 'png'
 * @returns {Promise<Blob>}
 */
export async function composite(artSrc, {
  frameSrc = null,
  maskMode = MASK_MODES.CIRCLE,
  maskSrc = null,
  fit = SUBJECT_FITS.COVER_TOP,
  size = 512,
  format = 'webp',
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const art = await loadImage(artSrc);
  drawFitted(ctx, art, size, fit);

  // ── Clip the subject ─────────────────────────────────────────────────────
  if (maskMode === MASK_MODES.IMAGE && maskSrc) {
    const mask = await loadImage(maskSrc);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0, size, size);
  } else if (maskMode === MASK_MODES.CIRCLE) {
    // Sized to Foundry's ring geometry, NOT full bleed. Dynamic rings expect a
    // subject filling SUBJECT_THICKNESS of the token; a full-bleed circle
    // reaches the outer edge and paints straight over the ring band.
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, (size * SUBJECT_THICKNESS) / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = 'source-over';

  // ── Lay the frame over the clipped subject ───────────────────────────────
  if (frameSrc) {
    const frame = await loadImage(frameSrc);
    ctx.drawImage(frame, 0, 0, size, size);
  }

  const blob = await new Promise(resolve => canvas.toBlob(resolve, `image/${format}`));
  if (!blob) throw new Error(`could not encode ${artSrc} as image/${format}`);
  log.debug(`composited ${artSrc} → ${size}px ${format}`);
  return blob;
}
