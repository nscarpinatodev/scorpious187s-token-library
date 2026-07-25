/**
 * Turning a library image into token document data.
 *
 * Two presentation modes, one source image:
 *
 *   dynamic — Foundry draws its own ring around the clipped art, which is set
 *             as an EXPLICIT subject via ring.subject.texture.
 *
 *             An earlier version left that field blank so Foundry would wrap
 *             whatever texture.src randomised to. Mechanically that works, but
 *             it lands in ring.mjs's `!explicitSubject` branch — the auto-fit
 *             path written for full-token images — and the subject ends up
 *             painted over the ring band rather than inside it. Tokenizer 2's
 *             own working patch sets subject.texture with subject.scale 1, so
 *             we do the same.
 *
 *             The cost is that native randomImg wildcards cannot vary a dynamic
 *             ring: #configureTexture swaps the mesh texture for the subject,
 *             so every randomised token would show the same art. Dynamic mode
 *             therefore always rolls per token in hooks/auto-apply.js instead.
 *
 *   frame   — the art is composited onto the chosen frame ahead of time and the
 *             flat result becomes texture.src, with the dynamic ring off. Here
 *             native wildcards work fine.
 */

import { SETTINGS, RING_MODES, MODULE_ID, FLAGS } from '../constants.js';
import { get, resolveRingEffects } from '../settings.js';
import { globFor, images as libraryImages } from '../library/index.js';
import { ensureBaked, variantPathFor, pendingBakes, currentVariant } from './bake.js';
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
 * @param {string} src The resolved texture path this token will use.
 * @returns {Record<string, unknown>}
 */
export function ringFields(src) {
  if (ringMode() === RING_MODES.FRAME) {
    return {
      'ring.enabled': false,
      'ring.subject.texture': null,
    };
  }
  return {
    'ring.enabled': true,
    // Explicit subject — see the module comment above.
    'ring.subject.texture': src,
    'ring.subject.scale': Number(get(SETTINGS.RING_SCALE)) || 1,
    'ring.colors.ring': colorOrNull(get(SETTINGS.RING_COLOR)),
    'ring.colors.background': colorOrNull(get(SETTINGS.RING_BACKGROUND)),
    'ring.effects': resolveRingEffects(get(SETTINGS.RING_EFFECTS)),
  };
}

/**
 * Resolve the texture path to use for an image under the current settings,
 * producing the processed variant if it does not exist yet.
 * @returns {Promise<string>}
 */
export async function texturePathFor(image) {
  const processed = await ensureBaked(image);
  if (!processed) {
    log.warn(`no processed variant for ${image.path}; falling back to the raw art`);
    return image.path;
  }
  return processed;
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
  for (const [key, value] of Object.entries(ringFields(src))) update[`${prefix}${key}`] = value;
  return update;
}

/**
 * Resolve what an "apply to actor" should actually write to.
 *
 * A token for an unlinked actor exposes a *synthetic* actor built from the
 * token's ActorDelta. Writing `prototypeToken.*` to that synthetic document
 * changes nothing anyone can see, which is why applying used to appear to work
 * for linked PCs and silently do nothing for NPCs. Always resolve back to the
 * world actor for prototype writes, and update the token itself separately.
 *
 * @param {Actor} actor
 * @returns {{worldActor: Actor|null, tokenDocument: TokenDocument|null}}
 */
export function resolveActorTarget(actor) {
  if (!actor) return { worldActor: null, tokenDocument: null };

  if (actor.isToken) {
    const tokenDocument = actor.token ?? null;
    // baseActor is the world actor the token was created from.
    const worldActor = tokenDocument?.baseActor ?? game.actors.get(actor.id) ?? null;
    return { worldActor, tokenDocument };
  }

  return { worldActor: actor, tokenDocument: null };
}

/** Every placed token on the current scene backed by this world actor. */
function placedTokensFor(worldActor) {
  if (!worldActor || !canvas?.scene) return [];
  return canvas.scene.tokens.filter(t => (t.baseActor?.id ?? t.actorId) === worldActor.id);
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

  // Group by scene: a selection can legitimately span scenes via the API.
  const byScene = new Map();
  for (const doc of docs) {
    const chosen = (varyPerToken && pool?.length)
      ? pool[Math.floor(Math.random() * pool.length)]
      : image;
    const update = { _id: doc.id, ...(await updateForImage(chosen)) };
    if (!doc.parent) continue;
    if (!byScene.has(doc.parent)) byScene.set(doc.parent, []);
    byScene.get(doc.parent).push(update);
  }

  const results = [];
  for (const [scene, updates] of byScene) {
    results.push(...await scene.updateEmbeddedDocuments('Token', updates));
  }
  return results;
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
 * @param {object} [options]
 * @param {boolean} [options.updatePlaced=true] Also retexture this actor's
 *        existing tokens on the current scene. Unlinked tokens do not inherit
 *        prototype changes, so without this an NPC appears unaffected.
 */
export async function applyToActor(actor, selection, { updatePlaced = true } = {}) {
  const { worldActor, tokenDocument } = resolveActorTarget(actor);
  if (!worldActor) {
    ui.notifications?.warn(game.i18n.localize('STL.Warn.NoActor'));
    return null;
  }

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

  await worldActor.update(update);
  await saveSelection(worldActor, { categoryId, facets, file });

  // Bring existing tokens in line. Linked tokens follow the prototype on their
  // own; unlinked ones each hold their own texture and must be written.
  let touched = 0;
  if (updatePlaced) {
    const placed = tokenDocument ? [tokenDocument] : placedTokensFor(worldActor);
    const unlinked = placed.filter(t => !t.actorLink);
    if (unlinked.length) {
      await applyToTokens(unlinked, representative, { varyPerToken: !pinned, pool });
      touched = unlinked.length;
    }
  }

  log.debug(
    `applied ${categoryId} to "${worldActor.name}"`
    + `${glob ? ` as wildcard ${glob}` : ''}${touched ? `, retextured ${touched} placed token(s)` : ''}`,
  );
  return { update, touched };
}

/**
 * The native wildcard path for a selection, or null when one cannot represent it.
 * When processing applies, the glob has to point at the variant directory,
 * which means the whole set must already be processed.
 */
async function wildcardFor(categoryId, facets, pool) {
  // A dynamic ring pins its own subject texture, so randomImg would randomise
  // texture.src while every token still rendered the same subject. Roll per
  // token instead (hooks/auto-apply.js).
  if (ringMode() !== RING_MODES.FRAME) return null;

  const glob = globFor(categoryId, facets);
  if (!glob) return null;

  const variant = currentVariant();
  if (!variant) return glob; // Raw art is what tokens actually use.

  const pending = await pendingBakes(pool);
  if (pending.length) return null; // Caller should process the set first.

  const sample = variantPathFor(pool[0], variant);
  const dir = sample.slice(0, sample.lastIndexOf('/'));
  const ext = sample.slice(sample.lastIndexOf('.') + 1);
  return `${dir}/*.${ext}`;
}

/** Clear a library assignment from an actor. */
export async function clearActor(actor) {
  const { worldActor } = resolveActorTarget(actor);
  if (!worldActor) return null;
  await saveSelection(worldActor, null);
  return worldActor.unsetFlag(MODULE_ID, FLAGS.AUTO_APPLIED);
}
