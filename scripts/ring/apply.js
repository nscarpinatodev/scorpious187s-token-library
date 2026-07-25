/**
 * Turning a library image into token document data.
 *
 * Two presentation modes, one source image:
 *
 *   dynamic — Foundry draws its own ring around the art. `ring.subject.texture`
 *             is left BLANK on purpose: ring.mjs only overrides the subject
 *             mesh when that field is truthy, so leaving it empty makes the
 *             ring wrap whatever texture.src resolved to. That is what lets a
 *             randomised wildcard keep its ring.
 *
 *   frame   — the art is composited onto the chosen frame ahead of time and the
 *             flat result becomes texture.src, with the dynamic ring off.
 */

import { SETTINGS, RING_MODES, MODULE_ID, FLAGS } from '../constants.js';
import { get, resolveRingEffects } from '../settings.js';
import { globFor, images as libraryImages } from '../library/index.js';
import { ensureBaked, bakedPathFor, pendingBakes } from './bake.js';
import { saveSelection } from '../library/matching.js';
import { log } from '../logger.js';

/** The active presentation mode. */
export function ringMode() {
  return get(SETTINGS.RING_MODE) === RING_MODES.FRAME ? RING_MODES.FRAME : RING_MODES.DYNAMIC;
}

/** Blank colour settings must become null — ColorField rejects empty strings. */
function colorOrNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed || null;
}

/**
 * The ring-related fields for the current mode, unprefixed.
 * @returns {Record<string, unknown>}
 */
export function ringFields() {
  if (ringMode() === RING_MODES.FRAME) {
    return { 'ring.enabled': false };
  }
  return {
    'ring.enabled': true,
    // Intentionally blank — see the module comment above.
    'ring.subject.texture': '',
    'ring.subject.scale': Number(get(SETTINGS.RING_SCALE)) || 1,
    'ring.colors.ring': colorOrNull(get(SETTINGS.RING_COLOR)),
    'ring.colors.background': colorOrNull(get(SETTINGS.RING_BACKGROUND)),
    'ring.effects': resolveRingEffects(get(SETTINGS.RING_EFFECTS)),
  };
}

/**
 * Resolve the texture path to use for an image under the current mode.
 * In frame mode this bakes the composite if it does not exist yet.
 * @returns {Promise<string|null>}
 */
export async function texturePathFor(image) {
  if (ringMode() !== RING_MODES.FRAME) return image.path;
  const baked = await ensureBaked(image);
  if (!baked) {
    log.warn(`no baked composite for ${image.path}; falling back to the raw art`);
    return image.path;
  }
  return baked;
}

/**
 * A complete token-document update for one image.
 * @param {object} image
 * @param {object} [options]
 * @param {string} [options.prefix] e.g. 'prototypeToken.' when writing an actor.
 * @returns {Promise<Record<string, unknown>>}
 */
export async function updateForImage(image, { prefix = '' } = {}) {
  const src = await texturePathFor(image);
  const update = { [`${prefix}texture.src`]: src };
  for (const [key, value] of Object.entries(ringFields())) update[`${prefix}${key}`] = value;
  return update;
}

/**
 * Apply an image to already-placed tokens.
 * @param {TokenDocument[]} tokenDocuments
 * @param {object} image
 * @param {object} [options]
 * @param {boolean} [options.varyPerToken] Give each token its own roll from a set.
 * @param {object[]} [options.pool] The set to roll from when varying.
 */
export async function applyToTokens(tokenDocuments, image, { varyPerToken = false, pool = null } = {}) {
  const docs = tokenDocuments.filter(Boolean);
  if (!docs.length) return [];

  const updates = [];
  for (const doc of docs) {
    const chosen = (varyPerToken && pool?.length)
      ? pool[Math.floor(Math.random() * pool.length)]
      : image;
    updates.push({ _id: doc.id, ...(await updateForImage(chosen)) });
  }

  const scene = docs[0].parent;
  if (!scene) return [];
  return scene.updateEmbeddedDocuments('Token', updates);
}

/**
 * Apply a selection to an actor's prototype token, and save the selection so
 * future drops reproduce it.
 *
 * When the filter happens to select every image in one directory we hand
 * Foundry a native wildcard (`randomImg`), which keeps working even if this
 * module is later disabled. Otherwise randomImg is turned off and the
 * preCreateToken hook rolls from the exact saved set instead — Foundry globs
 * cannot express an arbitrary facet filter.
 *
 * @param {Actor} actor
 * @param {{categoryId: string, facets: Record<string,string[]>, file: string|null}} selection
 */
export async function applyToActor(actor, selection) {
  const { categoryId, facets = {}, file = null } = selection;

  const pool = libraryImages(categoryId, facets);
  if (!pool.length) {
    ui.notifications?.warn(game.i18n.localize('STL.Warn.EmptySelection'));
    return null;
  }

  const pinned = file ? pool.find(i => i.path === file) : null;
  const representative = pinned ?? pool[Math.floor(Math.random() * pool.length)];

  const update = await updateForImage(representative, { prefix: 'prototypeToken.' });

  // A native glob is only possible for an unfiltered, single-directory,
  // single-extension set — and never for a pinned single image.
  const glob = pinned ? null : await wildcardFor(categoryId, facets, pool);
  if (glob) {
    update['prototypeToken.texture.src'] = glob;
    update['prototypeToken.randomImg'] = true;
  } else {
    update['prototypeToken.randomImg'] = false;
  }

  await actor.update(update);
  await saveSelection(actor, { categoryId, facets, file });
  log.debug(`applied ${categoryId} to "${actor.name}"${glob ? ` as wildcard ${glob}` : ''}`);
  return update;
}

/**
 * The native wildcard path for a selection, or null when one cannot represent it.
 * In frame mode the glob has to point at the baked directory, which means the
 * whole set must already be baked.
 */
async function wildcardFor(categoryId, facets, pool) {
  const glob = globFor(categoryId, facets);
  if (!glob) return null;
  if (ringMode() !== RING_MODES.FRAME) return glob;

  const pending = await pendingBakes(pool);
  if (pending.length) return null; // caller should bake first

  const sample = bakedPathFor(pool[0]);
  const dir = sample.slice(0, sample.lastIndexOf('/'));
  const ext = sample.slice(sample.lastIndexOf('.') + 1);
  return `${dir}/*.${ext}`;
}

/** Clear a library assignment from an actor. */
export async function clearActor(actor) {
  await saveSelection(actor, null);
  return actor.unsetFlag(MODULE_ID, FLAGS.AUTO_APPLIED);
}
