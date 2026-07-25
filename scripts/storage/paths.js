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

/** The FilePicker source bucket the library lives in ("data", "forgevtt", …). */
export function source() {
  return get(SETTINGS.LIBRARY_SOURCE) || 'data';
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

export function bakedDir(frameId, categoryId = '') {
  return join(root(), DIRS.BAKED, frameId, categoryId);
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

/**
 * Where a category's art image gets its baked counterpart under the given frame.
 * Extension is swapped to the configured export format by the caller.
 */
export function bakedPathFor(frameId, categoryId, filename) {
  return join(bakedDir(frameId, categoryId), filename);
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
