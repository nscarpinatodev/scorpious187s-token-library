/**
 * Every path the library touches is derived here, so the rest of the module
 * never concatenates strings by hand.
 *
 * The default root lives inside the module's own persistent storage
 * (`modules/<id>/storage`), which Foundry preserves across module updates
 * because the manifest sets `persistentStorage: true`. A GM may point
 * LIBRARY_PATH somewhere else; storage/relocate.js handles moving content when
 * they do.
 */

import { DIRS, MANIFEST_FILE, DEFAULT_ROOT, SETTINGS } from '../constants.js';
import { get } from '../settings.js';

/**
 * Percent-decode a path returned by Foundry's file APIs.
 *
 * FilePicker.browse() hands back paths already encoded for use in a URL, so a
 * file called "Seralyne Elven Ears.png" arrives as "Seralyne%20Elven%20Ears.png".
 * Carrying that through meant uploading a *new* file whose name literally
 * contained "%20", and writing that into texture.src — which Foundry then
 * encoded again to %2520 and failed to load ("Invalid Asset").
 *
 * The whole module therefore works in decoded space and lets the browser encode
 * when it actually fetches. Malformed sequences are left alone rather than
 * throwing.
 */
export function decodePath(path) {
  const value = String(path ?? '');
  if (!value.includes('%')) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Percent-encode a path for use as a URL — document fields like texture.src,
 * and `<img src>`.
 *
 * The counterpart to decodePath(). Internally the module works with real
 * filenames, because that is what gets uploaded and what browse() comparisons
 * need; anything handed to Foundry as an asset reference has to be encoded, per
 * its own convention of storing encoded paths in texture.src.
 *
 * Each segment is decoded before being re-encoded, so calling this on an
 * already-encoded path is a no-op rather than producing %2520.
 */
export function encodePath(path) {
  return String(path ?? '')
    .split('/')
    .map(segment => encodeURIComponent(decodePath(segment)))
    .join('/');
}

/** Strip leading/trailing slashes so joins never double up. */
export function trimSlashes(path) {
  return String(path ?? '').replace(/^\/+|\/+$/g, '');
}

/** Join path segments, ignoring empty ones. */
export function join(...segments) {
  return segments.map(trimSlashes).filter(Boolean).join('/');
}

/** The configured library root, normalised. Falls back to the default. */
export function root() {
  return trimSlashes(get(SETTINGS.LIBRARY_PATH) || DEFAULT_ROOT);
}

/**
 * The FilePicker source bucket the library lives in.
 *
 * Always "data" for now. Other sources (S3, Forge) are not supported: the
 * manifest is read back through a Foundry server route, which only resolves
 * for "data". The LIBRARY_SOURCE setting is shown disabled and deliberately
 * not read, so a world that set it before still lands on a working library.
 */
export function source() {
  return 'data';
}

/** True when the library is still using module persistent storage. */
export function isPersistentStorage() {
  return root() === trimSlashes(DEFAULT_ROOT);
}

export function manifestPath() {
  return join(root(), MANIFEST_FILE);
}

export function artDir(categoryId = '') {
  return join(root(), DIRS.ART, categoryId);
}

export function framesDir() {
  return join(root(), DIRS.FRAMES);
}

/**
 * Output directory for a processed image variant.
 * @param {string} variantId e.g. "frame-brass-ring" or "ring-dynamic-ring-circle-mask"
 */
export function bakedDir(variantId, categoryId = '') {
  return join(root(), DIRS.BAKED, variantId, categoryId);
}

/**
 * Stable directory-safe id for a frame image, so baked output for a given frame
 * always lands in the same place.
 * @param {string} frameSrc Full path to the frame image.
 */
export function frameIdFor(frameSrc) {
  const base = trimSlashes(frameSrc).split('/').pop() ?? '';
  const slug = slugify(base.replace(/\.\w+$/, ''));
  return slug || 'default';
}

/** Lowercase, hyphenated, filesystem-safe identifier. */
export function slugify(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Filename without its directory. */
export function basename(path) {
  return trimSlashes(path).split('/').pop() ?? '';
}

/** Lowercase extension without the dot, or '' when there is none. */
export function extension(path) {
  const name = basename(path);
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

/**
 * Deterministic, filesystem-safe name for a processed variant.
 *
 * Foundry's upload endpoint percent-encodes spaces in the filename it stores,
 * so asking it to write "Seralyne 3.webp" produces "Seralyne%203.webp" on disk.
 * Nothing then agrees: texture.src cannot resolve, and the existence check
 * never finds the file it just wrote, so every token drop re-processed the same
 * image.
 *
 * Rather than keep guessing at that behaviour, generated names avoid every
 * character it touches. These files are derived artefacts, so the name only has
 * to be stable and unique — a slug of the source name keeps it readable, and a
 * hash of the full source path keeps "a b.png" and "a-b.png" apart.
 *
 * @param {string} sourcePath Full path of the source artwork.
 * @param {string} ext        Output extension, without the dot.
 */
export function variantFilename(sourcePath, ext) {
  const stem = basename(decodePath(sourcePath)).replace(/\.\w+$/, '');
  const slug = slugify(stem).slice(0, 60) || 'image';
  return `${slug}-${hash36(decodePath(sourcePath))}.${ext}`;
}

/** FNV-1a, base36. Short, stable, and good enough to separate filenames. */
function hash36(value) {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Replace a path's extension (`swapExtension('a/b.png', 'webp')`). */
export function swapExtension(path, ext) {
  return `${trimSlashes(path).replace(/\.\w+$/, '')}.${ext}`;
}

/**
 * Foundry treats `*` in a token texture path as a wildcard and picks a random
 * match when `randomImg` is on. Escaping is not supported, so any literal `*`
 * in a directory name would break the query — we never create such names, but
 * callers can check.
 */
export function isWildcard(path) {
  return String(path ?? '').includes('*');
}
