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

import { SETTINGS, MODULE_ID, FLAGS, RING_MODES } from '../constants.js';
import { get } from '../settings.js';
import { isBuilt, images as libraryImages, randomImage } from '../library/index.js';
import { savedSelection, matchCategory } from '../library/matching.js';
import { ringFields, ringMode, updateForImage } from '../ring/apply.js';
import { bakedPathFor, isBakedSync } from '../ring/bake.js';
import { log } from '../logger.js';

/**
 * Applies that could not be resolved synchronously, finished on create.
 * Keyed by actor rather than token id, because preCreateToken runs before the
 * token has one. FIFO per actor, which is correct for multi-drops.
 * @type {Array<{actorId: string, image: object}>}
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
 * @returns {string|null} null when frame mode has no baked composite ready.
 */
function syncTexturePath(image) {
  if (ringMode() !== RING_MODES.FRAME) return image.path;
  return isBakedSync(image) ? bakedPathFor(image) : null;
}

function onPreCreateToken(document, data, options, userId) {
  // Only the client that asked for the token can meaningfully change its source
  // data, and only a GM should be rewriting artwork.
  if (game.user.id !== userId || !game.user.isGM) return;
  if (!isBuilt()) return;

  const actor = document.actor;
  if (!actor) return;

  const choice = chooseImage(actor, document);
  if (!choice) return;

  const src = syncTexturePath(choice.image);
  if (!src) {
    // Frame mode, composite not baked yet — finish asynchronously after create.
    deferred.push({ actorId: actor.id, image: choice.image });
    log.debug(`deferring frame-mode apply for "${actor.name}" (composite not baked)`);
    return;
  }

  const update = { 'texture.src': src, ...ringFields() };
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

  const index = deferred.findIndex(entry => entry.actorId === document.actor?.id);
  if (index === -1) return;
  const [pending] = deferred.splice(index, 1);

  try {
    const update = await updateForImage(pending.image);
    await document.update(update);
    log.debug(`completed deferred apply for "${document.name}"`);
  } catch (err) {
    log.warn('deferred apply failed:', err?.message ?? err);
  }
}

/** Exposed for the browser's "reroll this token" action. */
export function rerollToken(tokenDocument) {
  const actor = tokenDocument?.actor;
  if (!actor) return null;
  const saved = savedSelection(actor);
  if (!saved) return null;
  const pool = libraryImages(saved.categoryId, saved.facets);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}
