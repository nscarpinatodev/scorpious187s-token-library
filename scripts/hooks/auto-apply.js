/**
 * Applying library art as tokens are created.
 *
 * Two distinct jobs share this hook:
 *
 *   1. Rolling a saved selection. When the GM's filter had no native wildcard
 *      equivalent, applyToActor() turned randomImg off and left the exact set
 *      on an actor flag — so every drop has to roll from that set here.
 *
 *   2. Auto-applying to unconfigured actors that happen to match a category.
 *      Only ever touches actors still on the default token artwork, so a
 *      deliberately-chosen portrait is never overwritten.
 *
 * preCreateToken must decide synchronously, which is why frame mode relies on
 * the warmed bake cache and falls back to a post-create fix-up on a miss.
 */

import { SETTINGS, MODULE_ID, FLAGS } from '../constants.js';
import { get } from '../settings.js';
import { isBuilt, images as libraryImages, randomImage } from '../library/index.js';
import { savedSelection, matchCategory } from '../library/matching.js';
import { ringFields, updateForImage } from '../ring/apply.js';
import { variantPathFor, hasVariantSync, currentVariant } from '../ring/bake.js';
import { encodePath } from '../storage/paths.js';
import { log } from '../logger.js';

/**
 * Applies that could not be resolved synchronously, finished on create.
 * Keyed by actor rather than token id, because preCreateToken runs before the
 * token has one. FIFO per actor, which is correct for multi-drops.
 * @type {Array<{actorId: string, image: object, source: 'selection'|'match'}>}
 */
const deferred = [];

export function registerAutoApply() {
  Hooks.on('preCreateToken', onPreCreateToken);
  Hooks.on('createToken', onCreateToken);
}

/** True when the prototype token is still on stock artwork. */
function isDefaultArtwork(src) {
  if (!src) return true;
  const defaults = new Set([
    CONST.DEFAULT_TOKEN,
    'icons/svg/mystery-man.svg',
  ].filter(Boolean));
  return defaults.has(src);
}

/**
 * Resolve the texture path for an image without awaiting.
 * @returns {string|null} null when the processed variant is not ready yet.
 */
function syncTexturePath(image) {
  const variant = currentVariant();
  if (!variant) return image.path;
  return hasVariantSync(image, variant) ? variantPathFor(image, variant) : null;
}

function onPreCreateToken(document, data, options, userId) {
  // Only the client that asked for the token can meaningfully change its source
  // data, and only a GM should be rewriting artwork.
  if (game.user.id !== userId || !game.user.isGM) return;
  if (!isBuilt()) return;

  // Selections and match rules live on the world actor. For an unlinked token
  // `document.actor` can be the synthetic delta-backed actor, which carries
  // neither, so prefer the base actor.
  const actor = document.baseActor ?? document.actor;
  if (!actor) return;

  const choice = chooseImage(actor, document);
  if (!choice) return;

  // Encoded on the way into the document — see updateForImage().
  const src = encodePath(syncTexturePath(choice.image) ?? '') || null;
  if (!src) {
    // Processed variant not ready — finish asynchronously after create.
    deferred.push({ actorId: actor.id, image: choice.image, source: choice.source });
    log.debug(`deferring frame-mode apply for "${actor.name}" (composite not baked)`);
    return;
  }

  const update = { 'texture.src': src, ...ringFields(src) };
  if (choice.source === 'match') {
    update[`flags.${MODULE_ID}.${FLAGS.AUTO_APPLIED}`] = true;
  }
  document.updateSource(update);
  log.debug(`${choice.source === 'match' ? 'auto-applied' : 'rolled'} ${choice.image.filename} for "${actor.name}"`);
}

/**
 * Decide which library image, if any, this token should get.
 * @returns {{image: object, source: 'selection'|'match'}|null}
 */
function chooseImage(actor, document) {
  const saved = savedSelection(actor);

  if (saved) {
    // Foundry's own randomImg is already handling variation — stay out of it.
    if (actor.prototypeToken?.randomImg) return null;
    // A pinned single image is already on the prototype token.
    if (saved.file) return null;
    const image = randomImage(saved.categoryId, saved.facets);
    return image ? { image, source: 'selection' } : null;
  }

  if (!get(SETTINGS.AUTO_APPLY)) return null;
  if (actor.prototypeToken?.randomImg) return null;
  if (document.actorLink && !get(SETTINGS.AUTO_APPLY_LINKED)) return null;
  if (!isDefaultArtwork(actor.prototypeToken?.texture?.src)) return null;

  const matched = matchCategory(actor);
  if (!matched) return null;

  const image = randomImage(matched.category.id);
  if (!image) return null;

  log.debug(`"${actor.name}" matched category "${matched.category.id}" via ${matched.reason}`);
  return { image, source: 'match' };
}

/** Finish any apply that could not be resolved synchronously. */
async function onCreateToken(document, options, userId) {
  if (game.user.id !== userId || !game.user.isGM) return;

  const actorId = document.baseActor?.id ?? document.actor?.id;
  const index = deferred.findIndex(entry => entry.actorId === actorId);
  if (index === -1) return;
  const [pending] = deferred.splice(index, 1);

  try {
    const update = await updateForImage(pending.image);
    // Same marker the synchronous path sets, so a deferred auto-apply is still
    // recognised as ours and never fights a later manual change.
    if (pending.source === 'match') update[`flags.${MODULE_ID}.${FLAGS.AUTO_APPLIED}`] = true;
    await document.update(update);
    log.debug(`completed deferred apply for "${document.name}"`);
  } catch (err) {
    log.warn('deferred apply failed:', err?.message ?? err);
  }
}

/** Exposed for the browser's "reroll this token" action. */
export function rerollToken(tokenDocument) {
  const actor = tokenDocument?.baseActor ?? tokenDocument?.actor;
  if (!actor) return null;
  const saved = savedSelection(actor);
  if (!saved) return null;
  const pool = libraryImages(saved.categoryId, saved.facets);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
