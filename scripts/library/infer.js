/**
 * Filename → facet inference.
 *
 * Too Many Tokens encoded every trait in the filename and re-derived its filter
 * UI by splitting on capital letters. We store facets explicitly in the
 * manifest instead, but bulk-imported art rarely arrives pre-tagged — so the
 * same trick is kept as a *seed* for untagged files. The manifest remains the
 * source of truth; inference only fills gaps.
 */

import { slugify } from '../storage/paths.js';

/**
 * Break a filename into lowercase word tokens.
 * Handles CamelCase, ACRONYMWord, hyphens, underscores, dots and spaces, and
 * drops pure-numeric sequence suffixes ("…-01").
 * @param {string} filename
 * @returns {string[]}
 */
export function tokenizeFilename(filename) {
  return String(filename ?? '')
    .replace(/\.\w+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s\-_.]+/)
    .map(part => part.toLowerCase())
    .filter(part => part && !/^\d+$/.test(part));
}

/**
 * A hyphen-delimited, hyphen-bounded form of the filename, so multi-word facet
 * values ("fire genasi") can be matched without false positives.
 */
function haystack(filename) {
  return `-${tokenizeFilename(filename).join('-')}-`;
}

/**
 * Infer facet values for a filename.
 * @param {string} filename
 * @param {Array<{id: string, values: string[]}>} facets
 * @returns {Record<string, string>} Only facets that matched.
 */
export function inferFacets(filename, facets) {
  const hay = haystack(filename);
  const inferred = {};
  for (const facet of facets ?? []) {
    // Longest value first, so "half-elf" wins over "elf".
    const values = [...(facet.values ?? [])].sort((a, b) => b.length - a.length);
    const match = values.find(value => hay.includes(`-${slugify(value)}-`));
    if (match !== undefined) inferred[facet.id] = match;
  }
  return inferred;
}

/**
 * Suggest new facet values found in filenames but missing from the manifest.
 * Used by the import dialog to offer "add these as Race values?".
 *
 * @param {string[]} filenames
 * @param {Array<{id: string, values: string[]}>} facets
 * @param {string[]} [ignore] Tokens to never suggest (category name, etc).
 * @returns {string[]} Unrecognised tokens, most frequent first.
 */
export function unknownTokens(filenames, facets, ignore = []) {
  const known = new Set([
    ...ignore.map(slugify),
    ...(facets ?? []).flatMap(f => (f.values ?? []).map(slugify)),
  ]);
  const counts = new Map();
  for (const filename of filenames) {
    for (const token of new Set(tokenizeFilename(filename))) {
      const slug = slugify(token);
      if (!slug || known.has(slug)) continue;
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([token]) => token);
}
