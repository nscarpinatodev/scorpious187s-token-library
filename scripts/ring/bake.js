/**
 * Processed image variants.
 *
 * A token texture is one flat image, so neither presentation mode can use the
 * raw artwork directly:
 *
 *   frame mode   needs the art composited under the chosen frame;
 *   dynamic mode needs the art clipped to the ring's inner circle, or a square
 *                portrait spills outside the ring Foundry draws.
 *
 * Both produce a file under `baked/<variantId>/<category>/`, which is pure
 * cache — deleting it only costs a re-run. The one case that needs no
 * processing at all is dynamic mode with the mask cleared, where the raw art is
 * already ring-ready.
 *
 * Processing is explicit in the UI rather than implicit, because it is one
 * canvas composite plus one upload per image.
 */

import { SETTINGS, RING_MODES, MASK_MODES, SUBJECT_FITS, COMPOSITE_VERSION } from '../constants.js';
import { get } from '../settings.js';
import {
  bakedDir, frameIdFor, join, source, slugify, basename, decodePath, variantFilename,
} from '../storage/paths.js';
import { browse, uploadBlob } from '../storage/files.js';
import { composite } from './compositor.js';
import { log } from '../logger.js';

/** Directory listings keyed by variant directory, so we browse once per run. */
const listingCache = new Map();

/** Drop cached listings — call when the frame, mask, mode or format changes. */
export function invalidateCache() {
  listingCache.clear();
}

/**
 * Record a file we just wrote, so the next existence check sees it without a
 * round trip. Wiping the whole cache after a run instead meant every subsequent
 * token drop re-browsed — and, while names were being mangled, re-processed the
 * same image over and over.
 */
function noteWritten(target) {
  const dir = target.slice(0, target.lastIndexOf('/'));
  listingCache.get(dir)?.add(target);
}

/**
 * The configured frame image path, or '' when none is chosen.
 * Decoded because a file-picker setting stores whatever the picker handed back.
 */
export function frameSrc() {
  return decodePath(get(SETTINGS.FRAME_SRC) || '');
}

/** The configured custom mask image, only meaningful in MASK_MODES.IMAGE. */
export function maskSrc() {
  return decodePath(get(SETTINGS.RING_MASK) || '');
}

/** How source art is framed into the square, falling back to the safe default. */
export function subjectFit() {
  const configured = get(SETTINGS.SUBJECT_FIT);
  return Object.values(SUBJECT_FITS).includes(configured) ? configured : SUBJECT_FITS.COVER_TOP;
}

/** How the subject should be clipped, falling back to CIRCLE for bad values. */
export function maskMode() {
  const configured = get(SETTINGS.MASK_MODE);
  if (configured === MASK_MODES.NONE) return MASK_MODES.NONE;
  // "image" without a file chosen would silently do nothing; treat it as circle.
  if (configured === MASK_MODES.IMAGE && maskSrc()) return MASK_MODES.IMAGE;
  if (configured === MASK_MODES.IMAGE) return MASK_MODES.CIRCLE;
  return MASK_MODES.CIRCLE;
}

/**
 * @typedef {object} Variant
 * @property {string} id        Directory-safe id for this variant's output.
 * @property {string|null} frameSrc
 * @property {string} maskMode
 * @property {string|null} maskSrc
 * @property {string} label     Human-readable, for the UI.
 */

/**
 * What processing the current settings call for.
 *
 * The id encodes every input that changes the output, so switching frame or
 * mask writes to a fresh directory instead of colliding with stale files.
 * @returns {Variant|null} null when the raw art can be used as-is.
 */
export function currentVariant() {
  const mode = get(SETTINGS.RING_MODE) === RING_MODES.FRAME ? RING_MODES.FRAME : RING_MODES.DYNAMIC;
  const clip = maskMode();
  const frame = mode === RING_MODES.FRAME ? frameSrc() : '';

  // Nothing to do: no frame to lay on, and the art is used unclipped.
  if (!frame && clip === MASK_MODES.NONE) return null;

  const maskPart = clip === MASK_MODES.IMAGE
    ? `img-${slugify(basename(maskSrc()).replace(/\.\w+$/, '')) || 'mask'}`
    : clip;

  const fit = subjectFit();
  const parts = frame
    ? [`frame-${frameIdFor(frame)}`, maskPart, fit, `v${COMPOSITE_VERSION}`]
    : [`ring-${maskPart}`, fit, `v${COMPOSITE_VERSION}`];
  const labels = [frame ? basename(frame) : null, clip === MASK_MODES.IMAGE ? basename(maskSrc()) : clip]
    .filter(Boolean);

  return {
    id: parts.join('-'),
    frameSrc: frame || null,
    fit,
    maskMode: clip,
    maskSrc: clip === MASK_MODES.IMAGE ? maskSrc() : null,
    label: labels.join(' + '),
  };
}

/** True when the current settings require processed files. */
export function needsProcessing() {
  return currentVariant() !== null;
}

/**
 * Where a library image's processed file lives for a variant.
 * @param {{categoryId: string, filename: string}} image
 * @param {Variant} [variant]
 * @returns {string|null} null when no processing applies.
 */
export function variantPathFor(image, variant = currentVariant()) {
  if (!variant) return null;
  const format = get(SETTINGS.EXPORT_FORMAT) || 'webp';
  return join(bakedDir(variant.id, image.categoryId), variantFilename(image.path, format));
}

async function listing(dir) {
  if (!listingCache.has(dir)) {
    const { files } = await browse(source(), dir);
    listingCache.set(dir, new Set(files));
  }
  return listingCache.get(dir);
}

/**
 * Pre-list every variant directory for the current settings.
 *
 * preCreateToken has to decide on a texture synchronously, so we need to know
 * up front which processed files exist. One browse per category, skipped
 * entirely when no processing applies.
 * @param {string[]} categoryIds
 */
export async function warmCache(categoryIds) {
  const variant = currentVariant();
  if (!variant) return;
  await Promise.all(categoryIds.map(id => listing(bakedDir(variant.id, id))));
  log.debug(`variant cache warmed for ${categoryIds.length} categories (${variant.id})`);
}

/**
 * Synchronous "is this already processed?", answered from the warmed cache.
 * An unlisted directory counts as "not ready" rather than a guess.
 */
export function hasVariantSync(image, variant = currentVariant()) {
  if (!variant) return true; // Raw art is always ready.
  const target = variantPathFor(image, variant);
  const dir = target.slice(0, target.lastIndexOf('/'));
  return listingCache.get(dir)?.has(target) ?? false;
}

/**
 * Which of these images still need processing under the current variant.
 * @param {Array<object>} images
 * @returns {Promise<Array<object>>}
 */
export async function pendingBakes(images) {
  const variant = currentVariant();
  if (!variant) return [];

  const pending = [];
  for (const image of images) {
    const target = variantPathFor(image, variant);
    const dir = target.slice(0, target.lastIndexOf('/'));
    const files = await listing(dir);
    if (!files.has(target)) pending.push(image);
  }
  return pending;
}

/**
 * Produce processed files for a set of images.
 *
 * Sequential on purpose: each composite runs on a canvas and is followed by an
 * upload, so parallelism buys little and makes progress reporting misleading.
 *
 * @param {Array<object>} images
 * @param {object} [options]
 * @param {(done: number, total: number, image: object) => void} [options.onProgress]
 * @param {() => boolean} [options.shouldStop]
 * @param {boolean} [options.force] Re-process even when output already exists.
 * @returns {Promise<{baked: string[], skipped: number, failed: Array<{image: object, error: string}>}>}
 */
export async function bakeImages(images, { onProgress, shouldStop, force = false } = {}) {
  const variant = currentVariant();
  if (!variant) throw new Error('the current settings need no processing');

  const exportSize = Number(get(SETTINGS.EXPORT_SIZE)) || 512;
  const exportFormat = get(SETTINGS.EXPORT_FORMAT) || 'webp';

  const targets = force ? images : await pendingBakes(images);
  const skipped = images.length - targets.length;

  const baked = [];
  const failed = [];

  for (let i = 0; i < targets.length; i++) {
    if (shouldStop?.()) break;
    const image = targets[i];
    try {
      const blob = await composite(image.path, {
        frameSrc: variant.frameSrc,
        maskMode: variant.maskMode,
        maskSrc: variant.maskSrc,
        fit: variant.fit,
        size: exportSize,
        format: exportFormat,
      });
      const target = variantPathFor(image, variant);
      const dir = target.slice(0, target.lastIndexOf('/'));
      const filename = target.slice(target.lastIndexOf('/') + 1);
      const stored = await uploadBlob(source(), dir, filename, blob);
      if (stored) {
        baked.push(stored);
        noteWritten(target);
      } else failed.push({ image, error: 'upload rejected' });
    } catch (err) {
      failed.push({ image, error: String(err?.message ?? err) });
      log.warn(`processing failed for ${image.path}:`, err?.message ?? err);
    }
    onProgress?.(i + 1, targets.length, image);
  }

  log.log(`processing complete: ${baked.length} written, ${skipped} already present, ${failed.length} failed`);
  return { baked, skipped, failed };
}

/**
 * Ensure one image has its processed file, producing it on demand.
 * @returns {Promise<string|null>} The path to use, or null if it could not be made.
 */
export async function ensureBaked(image) {
  const variant = currentVariant();
  if (!variant) return image.path;

  const [pending] = await pendingBakes([image]);
  if (!pending) return variantPathFor(image, variant);

  const { baked } = await bakeImages([image]);
  return baked[0] ?? null;
}
