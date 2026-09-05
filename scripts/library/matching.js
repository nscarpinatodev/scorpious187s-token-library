/**
 * Resolving what the library should show — or apply — for a given actor.
 *
 * Precedence, in order:
 *   1. an explicit selection the GM saved from the browser (an actor flag);
 *   2. a category whose match rules fit the actor;
 *   3. nothing — the actor is left alone.
 *
 * Category matching is deliberately system-agnostic: name aliases first,
 * because they are the GM's own words, and creature type only as a last resort
 * through the lib's per-system resolver.
 */

import { MODULE_ID, FLAGS } from '../constants.js';
import { libApi } from '../integrations/lib.js';
import { category, categories, images, randomImage, tokenCount } from './index.js';
import { slugify } from '../storage/paths.js';

/**
 * @typedef {object} Selection
 * @property {string} categoryId
 * @property {Record<string, string[]>} facets  Facet filter; empty means "any".
 * @property {string|null} file  A pinned single image path, or null for random.
 */

/** Read the GM's saved selection off an actor, if any. */
export function savedSelection(actor) {
  const raw = actor?.getFlag?.(MODULE_ID, FLAGS.SELECTION);
  if (!raw?.categoryId) return null;
  return {
    categoryId: raw.categoryId,
    facets: raw.facets ?? {},
    file: raw.file ?? null,
  };
}

/** Persist a selection on an actor. Pass null to clear it. */
export async function saveSelection(actor, selection) {
  if (!selection) return actor.unsetFlag(MODULE_ID, FLAGS.SELECTION);
  return actor.setFlag(MODULE_ID, FLAGS.SELECTION, {
    categoryId: selection.categoryId,
    facets: selection.facets ?? {},
    file: selection.file ?? null,
  });
}

/** Word tokens of a name, lowercased. */
function nameTokens(name) {
  return String(name ?? '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean);
}

/**
 * Find the category that best fits an actor.
 *
 * Scoring keeps the strongest signal first so "Bandit Captain" resolves to the
 * `bandit` category rather than to whichever alias happens to be checked first.
 *
 * @param {Actor} actor
 * @returns {{category: object, score: number, reason: string}|null}
 */
export function matchCategory(actor) {
  if (!actor) return null;
  const name = String(actor.name ?? '');
  const normalized = slugify(name);
  const tokens = new Set(nameTokens(name));

  let best = null;
  const consider = (cat, score, reason) => {
    if (!best || score > best.score) best = { category: cat, score, reason };
  };

  for (const cat of categories()) {
    if (!tokenCount(cat)) continue;

    const aliases = [...new Set([cat.id, slugify(cat.label), ...cat.match.names.map(slugify)])]
      .filter(Boolean);

    for (const alias of aliases) {
      if (alias === normalized) {
        consider(cat, 100 + alias.length, `exact name "${alias}"`);
        continue;
      }
      // Whole-word containment: "bandit-captain" contains "bandit".
      if (`-${normalized}-`.includes(`-${alias}-`)) {
        consider(cat, 60 + alias.length, `name contains "${alias}"`);
        continue;
      }
      // Multi-word aliases still need to appear contiguously.
      if (alias.includes('-') && normalized.includes(alias)) {
        consider(cat, 50 + alias.length, `name contains "${alias}"`);
        continue;
      }
      if (tokens.has(alias)) {
        consider(cat, 40 + alias.length, `name token "${alias}"`);
      }
    }
  }

  if (best) return best;

  // Last resort: creature type, via the lib's per-system resolver.
  const creatureType = slugify(libApi()?.systems?.resolveCreatureType?.(actor) ?? '');
  if (creatureType) {
    for (const cat of categories()) {
      if (!tokenCount(cat)) continue;
      if (cat.match.creatureTypes.map(slugify).includes(creatureType)) {
        consider(cat, 10, `creature type "${creatureType}"`);
      }
    }
  }

  return best;
}

/**
 * Resolve what should actually be applied to a token for this actor.
 *
 * @param {Actor} actor
 * @returns {{image: object, selection: Selection, source: 'selection'|'match'}|null}
 */
export function resolveForActor(actor) {
  const saved = savedSelection(actor);
  if (saved && category(saved.categoryId)) {
    // A pinned file wins outright; otherwise pick from the saved filter.
    if (saved.file) {
      const pinned = images(saved.categoryId).find(i => i.path === saved.file);
      if (pinned) return { image: pinned, selection: saved, source: 'selection' };
    }
    const image = randomImage(saved.categoryId, saved.facets);
    if (image) return { image, selection: saved, source: 'selection' };
  }

  const matched = matchCategory(actor);
  if (!matched) return null;

  const image = randomImage(matched.category.id);
  if (!image) return null;

  return {
    image,
    selection: { categoryId: matched.category.id, facets: {}, file: null },
    source: 'match',
  };
}
