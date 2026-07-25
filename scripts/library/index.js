/**
 * The in-memory library index.
 *
 * Built from every manifest source plus a directory scan, so art dropped
 * straight into `art/<category>/` shows up without anyone hand-editing JSON.
 * Everything downstream (browser, auto-apply, baking) queries this module and
 * never touches storage directly.
 */

import { HOOK_CHANGED, HOOK_READY, DIRS } from '../constants.js';
import { loadSources, saveOverlay, defaultManifest } from '../storage/manifest.js';
import { browse, browseImages } from '../storage/files.js';
import { source, join, basename, slugify, root as libraryRoot } from '../storage/paths.js';
import { inferFacets } from './infer.js';
import { log } from '../logger.js';

/**
 * @typedef {object} LibraryImage
 * @property {string} path      Full served path, ready for texture.src.
 * @property {string} filename  Basename including extension.
 * @property {string} dir       Directory the file lives in.
 * @property {string} categoryId
 * @property {Record<string,string>} facets
 * @property {string} sourceId  Which manifest source contributed it.
 * @property {boolean} readOnly True for art-pack images.
 */

/**
 * @typedef {object} LibraryCategory
 * @property {string} id
 * @property {string} label
 * @property {{names: string[], creatureTypes: string[]}} match
 * @property {LibraryImage[]} images
 * @property {boolean} readOnly True when no writable source contributes to it.
 */

let state = {
  built: false,
  facets: /** @type {Array<{id: string, label: string, values: string[]}>} */ ([]),
  categories: /** @type {Map<string, LibraryCategory>} */ (new Map()),
  /** The writable overlay, kept in memory so edits do not need a re-read. */
  overlay: defaultManifest(),
};

// ── Queries ──────────────────────────────────────────────────────────────────

export function isBuilt() {
  return state.built;
}

/** All facets, in manifest order. */
export function facets() {
  return state.facets;
}

export function facet(id) {
  return state.facets.find(f => f.id === id) ?? null;
}

/** All categories, alphabetical by label. */
export function categories() {
  return [...state.categories.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function category(id) {
  return state.categories.get(id) ?? null;
}

/** Total image count across the library. */
export function imageCount() {
  let total = 0;
  for (const cat of state.categories.values()) total += cat.images.length;
  return total;
}

/**
 * Only the facets that actually vary within a category, with only the values
 * present there — so the browser never offers a filter that matches nothing.
 * @param {string} categoryId
 * @returns {Array<{id: string, label: string, values: string[]}>}
 */
export function facetsFor(categoryId) {
  const cat = category(categoryId);
  if (!cat) return [];
  const present = new Map();
  for (const image of cat.images) {
    for (const [facetId, value] of Object.entries(image.facets)) {
      if (!present.has(facetId)) present.set(facetId, new Set());
      present.get(facetId).add(value);
    }
  }
  return state.facets
    .filter(f => present.has(f.id))
    .map(f => ({
      id: f.id,
      label: f.label,
      // Keep manifest ordering, then append any value only found on disk.
      values: [
        ...f.values.filter(v => present.get(f.id).has(v)),
        ...[...present.get(f.id)].filter(v => !f.values.includes(v)).sort(),
      ],
    }));
}

/**
 * Images in a category matching a facet filter.
 *
 * A filter entry with no selected values is ignored. An image that carries no
 * value for a filtered facet cannot satisfy it and is excluded.
 *
 * @param {string} categoryId
 * @param {Record<string, string[]>} [filter]
 * @returns {LibraryImage[]}
 */
export function images(categoryId, filter = {}) {
  const cat = category(categoryId);
  if (!cat) return [];
  const active = Object.entries(filter).filter(([, values]) => values?.length);
  if (!active.length) return cat.images;
  return cat.images.filter(image =>
    active.every(([facetId, values]) => values.includes(image.facets[facetId])));
}

/** A random image from a filtered set, or null when the set is empty. */
export function randomImage(categoryId, filter = {}) {
  const set = images(categoryId, filter);
  if (!set.length) return null;
  return set[Math.floor(Math.random() * set.length)];
}

/**
 * A native Foundry wildcard glob for a filtered set — but only when the set is
 * *exactly* every image in a single directory. Foundry globs match filenames
 * within one directory, so an arbitrary facet filter usually has no glob
 * equivalent; callers fall back to our own random-from-set behaviour.
 *
 * @returns {string|null}
 */
export function globFor(categoryId, filter = {}) {
  const selected = images(categoryId, filter);
  if (!selected.length) return null;

  const dirs = new Set(selected.map(i => i.dir));
  if (dirs.size !== 1) return null;

  const dir = [...dirs][0];
  const all = category(categoryId).images.filter(i => i.dir === dir);
  if (all.length !== selected.length) return null;

  const extensions = new Set(selected.map(i => i.filename.split('.').pop().toLowerCase()));
  if (extensions.size !== 1) return null;

  return `${dir}/*.${[...extensions][0]}`;
}

// ── Building ─────────────────────────────────────────────────────────────────

/**
 * Rebuild the index from storage.
 * @param {object} [options]
 * @param {boolean} [options.scan=true] Also scan art directories for untracked files.
 */
export async function build({ scan = true } = {}) {
  const sources = await loadSources();

  const facetMap = new Map();
  const categoryMap = new Map();

  // Gather suppressions first. The overlay is loaded last, so a removal it
  // records has to be known before earlier sources — and the directory scan —
  // get a chance to add the image back.
  const removed = new Set();
  for (const src of sources) {
    for (const c of src.manifest.categories) {
      for (const image of c.images) {
        if (image.removed) removed.add(image.external ? image.file : join(src.root, image.file));
      }
    }
  }

  for (const src of sources) {
    if (!src.readOnly) state.overlay = src.manifest;

    for (const f of src.manifest.facets) {
      const existing = facetMap.get(f.id);
      if (!existing) facetMap.set(f.id, { id: f.id, label: f.label, values: [...f.values] });
      else {
        existing.label = f.label || existing.label;
        for (const value of f.values) if (!existing.values.includes(value)) existing.values.push(value);
      }
    }

    for (const c of src.manifest.categories) {
      const existing = categoryMap.get(c.id) ?? {
        id: c.id, label: c.label, match: { names: [], creatureTypes: [] },
        images: [], removed: [], readOnly: true,
      };
      existing.label = c.label || existing.label;
      existing.match.names = [...new Set([...existing.match.names, ...c.match.names])];
      existing.match.creatureTypes = [...new Set([...existing.match.creatureTypes, ...c.match.creatureTypes])];
      if (!src.readOnly) existing.readOnly = false;

      for (const image of c.images) {
        const path = image.external ? image.file : join(src.root, image.file);
        if (removed.has(path)) {
          if (!existing.removed.includes(path)) existing.removed.push(path);
          continue;
        }
        if (existing.images.some(i => i.path === path)) continue;
        existing.images.push({
          path,
          filename: basename(path),
          dir: path.slice(0, path.lastIndexOf('/')),
          categoryId: c.id,
          facets: { ...image.facets },
          sourceId: src.id,
          readOnly: src.readOnly,
        });
      }

      categoryMap.set(c.id, existing);
    }
  }

  state.facets = [...facetMap.values()];
  state.categories = categoryMap;

  if (scan) await scanArtDirectories(sources, removed);

  for (const cat of state.categories.values()) {
    cat.images.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
  }

  state.built = true;
  log.log(`index built: ${state.categories.size} categories, ${imageCount()} images`);
  Hooks.callAll(HOOK_CHANGED);
  return state;
}

/**
 * Pick up image files sitting in `art/<categoryId>/` that no manifest mentions.
 * Categories are created on the fly for unknown directories, and facets are
 * inferred from filenames, so a GM can populate the library by dropping folders
 * in and never opening the JSON.
 */
async function scanArtDirectories(sources, removed = new Set()) {
  const scanRoots = [
    { id: 'overlay', root: libraryRoot(), readOnly: false, source: source() },
    // Art packs are modules, so they always live in the "data" bucket even when
    // the GM has moved the library itself to S3 or a Forge asset library.
    ...sources.filter(s => s.readOnly).map(s => ({ id: s.id, root: s.root, readOnly: true, source: 'data' })),
  ];

  for (const scanRoot of scanRoots) {
    const base = join(scanRoot.root, DIRS.ART);
    const { dirs } = await browse(scanRoot.source, base);
    if (!dirs.length) continue;

    for (const dir of dirs) {
      const categoryId = slugify(basename(dir));
      if (!categoryId) continue;

      let cat = state.categories.get(categoryId);
      if (!cat) {
        cat = {
          id: categoryId,
          label: titleCase(basename(dir)),
          match: { names: [basename(dir).toLowerCase()], creatureTypes: [] },
          images: [],
          removed: [],
          readOnly: scanRoot.readOnly,
        };
        state.categories.set(categoryId, cat);
        log.debug(`discovered untracked category "${categoryId}" at ${dir}`);
      }
      if (!scanRoot.readOnly) cat.readOnly = false;

      for (const path of await browseImages(scanRoot.source, dir)) {
        if (removed.has(path)) {
          if (!cat.removed.includes(path)) cat.removed.push(path);
          continue;
        }
        if (cat.images.some(i => i.path === path)) continue;
        const filename = basename(path);
        cat.images.push({
          path,
          filename,
          dir,
          categoryId,
          facets: inferFacets(filename, state.facets),
          sourceId: scanRoot.id,
          readOnly: scanRoot.readOnly,
        });
      }
    }
  }
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .trim();
}

// ── Mutations ────────────────────────────────────────────────────────────────
//
// All edits go to the writable overlay and then rebuild. The overlay is the
// only thing we ever persist; art-pack manifests stay untouched.

/** The current overlay manifest (a live reference — clone before mutating). */
export function overlay() {
  return state.overlay;
}

/** Persist the overlay and rebuild the index. */
export async function commit(manifest) {
  state.overlay = manifest;
  await saveOverlay(manifest);
  await build();
}

/**
 * Ensure the overlay has a category entry, so directory-scanned categories can
 * be edited. Returns the overlay category object.
 */
export function ensureOverlayCategory(manifest, categoryId) {
  let entry = manifest.categories.find(c => c.id === categoryId);
  if (!entry) {
    const known = category(categoryId);
    entry = {
      id: categoryId,
      label: known?.label ?? titleCase(categoryId),
      match: {
        names: [...(known?.match.names ?? [])],
        creatureTypes: [...(known?.match.creatureTypes ?? [])],
      },
      images: [],
    };
    manifest.categories.push(entry);
  }
  return entry;
}

/** Ensure the overlay has a facet entry. Returns it. */
export function ensureOverlayFacet(manifest, facetId, label = null) {
  let entry = manifest.facets.find(f => f.id === facetId);
  if (!entry) {
    entry = { id: facetId, label: label ?? titleCase(facetId), values: [] };
    manifest.facets.push(entry);
  }
  if (label) entry.label = label;
  return entry;
}

/** Deep clone of the overlay, safe to mutate before commit(). */
export function draftOverlay() {
  return foundry.utils.deepClone(state.overlay);
}

/**
 * Assign trait values to specific images.
 *
 * Filename inference only helps when filenames say something; AI-generated
 * names like `openart-0217785285…` carry nothing, so tagging by hand is the
 * only way those images ever become filterable. Images discovered by the
 * directory scan have no manifest entry yet, so one is created here.
 *
 * @param {string} categoryId
 * @param {string[]} paths        Full paths of the images to tag.
 * @param {Record<string,string>} assignments  facetId → value. An empty string
 *        clears that facet on the selected images.
 */
export async function setImageFacets(categoryId, paths, assignments) {
  const cat = category(categoryId);
  if (!cat || !paths.length) return;

  const draft = draftOverlay();
  const entry = ensureOverlayCategory(draft, categoryId);
  const targets = new Set(paths);

  // Any new value must exist on its facet, or the filter chips will not offer it.
  for (const [facetId, value] of Object.entries(assignments)) {
    if (!value) continue;
    const facet = ensureOverlayFacet(draft, facetId);
    if (!facet.values.includes(value)) facet.values.push(value);
  }

  for (const image of cat.images) {
    if (!targets.has(image.path)) continue;
    if (image.readOnly) continue; // Art-pack images are not ours to rewrite.
    const record = overlayRecordFor(entry, image);
    for (const [facetId, value] of Object.entries(assignments)) {
      if (value) record.facets[facetId] = value;
      else delete record.facets[facetId];
    }
  }

  await commit(draft);
}

/**
 * How an image path is written into the overlay manifest: relative to the
 * library root where possible, absolute and flagged external otherwise.
 */
function relativise(path) {
  const prefix = `${libraryRoot()}/`;
  return path.startsWith(prefix)
    ? { file: path.slice(prefix.length), external: false }
    : { file: path, external: true };
}

/** Find or create this image's entry in an overlay category. */
function overlayRecordFor(entry, image) {
  const { file, external } = relativise(image.path);
  let record = entry.images.find(i => i.file === file);
  if (!record) {
    record = { file, external, facets: { ...image.facets } };
    entry.images.push(record);
  }
  return record;
}

/**
 * Remove images from the library.
 *
 * Foundry exposes no file-delete API — file-picker.mjs offers only browse,
 * createDirectory and upload — so the files stay on disk and the manifest
 * records the removal. That is also what makes it stick: the directory scan
 * would otherwise re-add anything still present, and it is reversible.
 *
 * Art-pack images can be removed too; the suppression simply lives in the GM's
 * overlay rather than in the pack.
 *
 * @param {string} categoryId
 * @param {string[]} paths Full paths of the images to remove.
 */
export async function removeImages(categoryId, paths) {
  const cat = category(categoryId);
  if (!cat || !paths.length) return;

  const draft = draftOverlay();
  const entry = ensureOverlayCategory(draft, categoryId);
  const targets = new Set(paths);

  for (const image of cat.images) {
    if (!targets.has(image.path)) continue;
    overlayRecordFor(entry, image).removed = true;
  }

  await commit(draft);
  log.log(`removed ${paths.length} image(s) from "${categoryId}" (files left on disk)`);
}

/** Bring back everything previously removed from a category. */
export async function restoreRemoved(categoryId) {
  const draft = draftOverlay();
  const entry = draft.categories.find(c => c.id === categoryId);
  if (!entry) return;

  let restored = 0;
  for (const record of entry.images) {
    if (!record.removed) continue;
    delete record.removed;
    restored++;
  }
  if (!restored) return;

  await commit(draft);
  log.log(`restored ${restored} removed image(s) in "${categoryId}"`);
}

/** Announce that the library is queryable. Called once from main.js. */
export function announceReady() {
  Hooks.callAll(HOOK_READY, {
    categories: state.categories.size,
    images: imageCount(),
  });
}
