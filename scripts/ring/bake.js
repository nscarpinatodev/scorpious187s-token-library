/**
 * Frame-mode baking.
 *
 * Dynamic ring mode costs nothing: Foundry draws the ring at render time. Frame
 * mode has to produce a real file per (frame × image), because a token texture
 * is one flat image. Those composites live under `baked/<frameId>/<category>/`
 * and are pure cache — deleting the directory only costs a re-bake.
 *
 * Baking is deliberately explicit in the UI rather than implicit, since a large
 * category means one composite + one upload per image.
 */

import { SETTINGS } from '../constants.js';
import { get } from '../settings.js';
import {
  bakedDir, frameIdFor, join, swapExtension, source,
} from '../storage/paths.js';
import { browse, uploadBlob } from '../storage/files.js';
import { compositeToBlob, available as tokenizerAvailable } from '../integrations/tokenizer2.js';
import { log } from '../logger.js';

/** Directory listings keyed by baked directory, so we browse once per bake run. */
const listingCache = new Map();

/** Drop cached listings — call after baking or when the frame changes. */
export function invalidateCache() {
  listingCache.clear();
}

/** The configured frame image path, or '' when none is chosen. */
export function frameSrc() {
  return get(SETTINGS.FRAME_SRC) || '';
}

/** Stable id for the configured frame. */
export function currentFrameId() {
  return frameIdFor(frameSrc());
}

/**
 * Where a library image's composite lives under the current frame.
 * @param {{categoryId: string, filename: string}} image
 * @returns {string}
 */
export function bakedPathFor(image, frameId = currentFrameId()) {
  const format = get(SETTINGS.EXPORT_FORMAT) || 'webp';
  return join(bakedDir(frameId, image.categoryId), swapExtension(image.filename, format));
}

async function listing(dir) {
  if (!listingCache.has(dir)) {
    const { files } = await browse(source(), dir);
    listingCache.set(dir, new Set(files));
  }
  return listingCache.get(dir);
}

/**
 * Pre-list every baked directory for the current frame.
 *
 * preCreateToken has to decide on a texture synchronously, so in frame mode we
 * need to already know which composites exist. Called on ready and whenever the
 * frame or mode changes — one browse per category, and only in frame mode.
 * @param {string[]} categoryIds
 */
export async function warmCache(categoryIds) {
  const frameId = currentFrameId();
  await Promise.all(categoryIds.map(id => listing(bakedDir(frameId, id))));
  log.debug(`baked-cache warmed for ${categoryIds.length} categories`);
}

/**
 * Synchronous "is this already baked?", answered from the warmed cache.
 * Returns false when the directory has not been listed yet, so callers treat an
 * unknown state as "not ready" rather than guessing.
 */
export function isBakedSync(image, frameId = currentFrameId()) {
  const target = bakedPathFor(image, frameId);
  const dir = target.slice(0, target.lastIndexOf('/'));
  return listingCache.get(dir)?.has(target) ?? false;
}

/**
 * Which of these images still need baking under the current frame.
 * @param {Array<object>} images
 * @returns {Promise<Array<object>>}
 */
export async function pendingBakes(images) {
  const frameId = currentFrameId();
  const pending = [];
  for (const image of images) {
    const target = bakedPathFor(image, frameId);
    const dir = target.slice(0, target.lastIndexOf('/'));
    const files = await listing(dir);
    if (!files.has(target)) pending.push(image);
  }
  return pending;
}

/**
 * Bake a set of images under the current frame.
 *
 * Sequential on purpose: each composite runs on a canvas and is followed by an
 * upload, so parallelism buys little and makes progress reporting misleading.
 *
 * @param {Array<object>} images
 * @param {object} [options]
 * @param {(done: number, total: number, image: object) => void} [options.onProgress]
 * @param {() => boolean} [options.shouldStop]
 * @param {boolean} [options.force] Re-bake even when a composite already exists.
 * @returns {Promise<{baked: string[], skipped: number, failed: Array<{image: object, error: string}>}>}
 */
export async function bakeImages(images, { onProgress, shouldStop, force = false } = {}) {
  const frame = frameSrc();
  if (!frame) throw new Error('no frame is configured');
  if (!tokenizerAvailable()) throw new Error('Tokenizer 2 is not available');

  const frameId = frameIdFor(frame);
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
      const blob = await compositeToBlob(image.path, frame, { exportSize, exportFormat });
      const target = bakedPathFor(image, frameId);
      const dir = target.slice(0, target.lastIndexOf('/'));
      const filename = target.slice(target.lastIndexOf('/') + 1);
      const stored = await uploadBlob(source(), dir, filename, blob);
      if (stored) baked.push(stored);
      else failed.push({ image, error: 'upload rejected' });
    } catch (err) {
      failed.push({ image, error: String(err?.message ?? err) });
      log.warn(`bake failed for ${image.path}:`, err?.message ?? err);
    }
    onProgress?.(i + 1, targets.length, image);
  }

  invalidateCache();
  log.log(`bake complete: ${baked.length} written, ${skipped} already present, ${failed.length} failed`);
  return { baked, skipped, failed };
}

/**
 * Ensure a single image is baked, baking it on demand.
 * @returns {Promise<string|null>} The baked path, or null when it could not be produced.
 */
export async function ensureBaked(image) {
  const [pending] = await pendingBakes([image]);
  if (!pending) return bakedPathFor(image);
  const { baked } = await bakeImages([image]);
  return baked[0] ?? null;
}
