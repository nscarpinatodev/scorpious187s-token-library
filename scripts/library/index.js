/**
 * The in-memory library index.
 *
 * Built from every manifest source plus a directory scan, so art dropped
 * straight into `art/<category>/` shows up without anyone hand-editing JSON.
 * Everything downstream (browser, auto-apply, baking) queries this module and
 * never touches storage directly.
 */

import { HOOK_CHANGED, HOOK_READY, DIRS, MAX_TREE_DEPTH, FRAMING, FRAMING_FACET } from '../constants.js';
import { loadSources, saveOverlay, defaultManifest } from '../storage/manifest.js';
import { browse, browseImages } from '../storage/files.js';
import { source, join, basename, slugify, decodePath, root as libraryRoot } from '../storage/paths.js';
import { inferFacets } from './infer.js';
import { isPortrait as detectPortrait, pairPortraits } from './framing.js';
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
 * @property {boolean} isPortrait True for portrait/reference art, which is kept
 *           out of token pools and used for actor avatars instead.
 * @property {string|null} portrait Path of this image's paired portrait, when
 *           one was found in the same directory.
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

/**
 * Total token-art count across the library.
 * Portraits are excluded: they are never dropped on the canvas, so counting
 * them would overstate what the library can actually put on a token.
 */
export function imageCount() {
  let total = 0;
  for (const cat of state.categories.values()) {
    total += cat.images.reduce((n, image) => n + (image.isPortrait ? 0 : 1), 0);
  }
  return total;
}

/** Total portrait count across the library. */
export function portraitCount() {
  let total = 0;
  for (const cat of state.categories.values()) {
    total += cat.images.reduce((n, image) => n + (image.isPortrait ? 1 : 0), 0);
  }
  return total;
}

/** How much token art a category holds, ignoring its portraits. */
export function tokenCount(cat) {
  return cat.images.reduce((n, image) => n + (image.isPortrait ? 0 : 1), 0);
}

/**
 * The portrait paired with an image, or null.
 * Resolved at build time; this is just the lookup.
 * @param {LibraryImage|null} image
 * @returns {LibraryImage|null}
 */
export function portraitFor(image) {
  if (!image?.portrait) return null;
  const cat = category(image.categoryId);
  return cat?.images.find(candidate => candidate.path === image.portrait) ?? null;
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
    for (const [facetId, values] of Object.entries(image.facets)) {
      if (!present.has(facetId)) present.set(facetId, new Set());
      for (const value of values) present.get(facetId).add(value);
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
 * A filter entry with no selected values is ignored. Within one trait the
 * selected values are OR-ed and an image needs any of them; across traits they
 * are AND-ed. An image carrying no value at all for a filtered trait cannot
 * satisfy it and is excluded.
 *
 * @param {string} categoryId
 * @param {Record<string, string[]>} [filter]
 * @returns {LibraryImage[]}
 */
export function images(categoryId, filter = {}, { includePortraits = false } = {}) {
  const cat = category(categoryId);
  if (!cat) return [];
  const pool = includePortraits ? cat.images : cat.images.filter(image => !image.isPortrait);
  const active = Object.entries(filter).filter(([, values]) => values?.length);
  if (!active.length) return pool;
  return pool.filter(image => active.every(([facetId, wanted]) => {
    const held = image.facets[facetId];
    return Array.isArray(held) && held.some(value => wanted.includes(value));
  }));
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
        if (image.removed) removed.add(resolveImagePath(src.root, image));
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
        const path = resolveImagePath(src.root, image);
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
          isPortrait: detectPortrait(basename(path), image.facets),
          portrait: null,
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
    linkPortraits(cat);
  }

  state.built = true;
  log.log(
    `index built: ${state.categories.size} categories, ${imageCount()} images`
    + `, ${portraitCount()} portrait(s)`,
  );
  Hooks.callAll(HOOK_CHANGED);
  return state;
}

/**
 * Pick up image files sitting under `art/<categoryId>/` that no manifest
 * mentions. Categories are created on the fly for unknown directories, so a GM
 * can populate the library by dropping folders in and never opening the JSON.
 *
 * Subfolders are traits. `art/commoner/elf/female/x.png` tags that image
 * race: elf, gender: female, because each folder name is looked up against the
 * known trait values. Folders that match nothing — `batch-2`, `raw` — are just
 * organisation and are ignored, so nesting can never break a scan.
 *
 * This is the cheap way to tag a generated batch: sort on export, and the
 * library reads the sorting.
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

      await scanCategoryDir(scanRoot, dir, cat, removed, [], 0);
    }
  }
}

/** Walk one category directory and everything nested inside it. */
async function scanCategoryDir(scanRoot, dir, cat, removed, trail, depth) {
  const fromFolders = facetsFromTrail(trail);

  for (const path of await browseImages(scanRoot.source, dir)) {
    if (removed.has(path)) {
      if (!cat.removed.includes(path)) cat.removed.push(path);
      continue;
    }
    if (cat.images.some(i => i.path === path)) continue;

    const filename = basename(path);
    // Folders beat the filename: putting a file in a folder is deliberate,
    // whereas a filename match can be a coincidence.
    const facets = { ...inferFacets(filename, state.facets), ...fromFolders };
    cat.images.push({
      path,
      filename,
      dir,
      categoryId: cat.id,
      facets,
      sourceId: scanRoot.id,
      readOnly: scanRoot.readOnly,
      isPortrait: detectPortrait(filename, facets),
      portrait: null,
    });
  }

  if (depth >= MAX_TREE_DEPTH) {
    log.warn(`stopped scanning below ${dir} — nested more than ${MAX_TREE_DEPTH} deep`);
    return;
  }

  const { dirs } = await browse(scanRoot.source, dir);
  for (const sub of dirs) {
    await scanCategoryDir(scanRoot, sub, cat, removed, [...trail, basename(sub)], depth + 1);
  }
}

/**
 * Work out each image's paired portrait, one directory at a time.
 *
 * Per directory because that is the unit a generated set arrives in, and
 * because it keeps the comparison cheap — pairing is O(tokens x portraits)
 * within a folder rather than across a category of hundreds.
 */
function linkPortraits(cat) {
  const byDir = new Map();
  for (const image of cat.images) {
    image.portrait = null;
    if (!byDir.has(image.dir)) byDir.set(image.dir, []);
    byDir.get(image.dir).push(image);
  }

  for (const group of byDir.values()) {
    const pairs = pairPortraits(group);
    if (!pairs.size) continue;
    for (const image of group) {
      image.portrait = pairs.get(image.path) ?? null;
    }
  }
}

/**
 * Resolve a chain of folder names to trait values.
 * Unrecognised names contribute nothing rather than becoming stray values.
 * @param {string[]} trail
 * @returns {Record<string, string[]>}
 */
function facetsFromTrail(trail) {
  const resolved = {};
  for (const segment of trail) {
    for (const [facetId, values] of Object.entries(inferFacets(segment, state.facets))) {
      resolved[facetId] = [...new Set([...(resolved[facetId] ?? []), ...values])];
    }
  }
  return resolved;
}

/**
 * Full path for a manifest image entry, in the module's canonical decoded form.
 *
 * Manifest entries written before paths were normalised can hold encoded names
 * ("Seralyne%203.jpg"), and decoding only browse() results left those alone —
 * so a scanned file and its manifest entry looked like two different images.
 */
function resolveImagePath(sourceRoot, image) {
  const file = decodePath(image.file);
  return image.external ? file : join(sourceRoot, file);
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
 * Only the traits named in `assignments` are touched; anything else the images
 * already carry is left alone, so tagging one trait never wipes another.
 *
 * @param {string} categoryId
 * @param {string[]} paths  Full paths of the images to tag.
 * @param {Record<string,string[]>} assignments  facetId → values. An empty
 *        array clears that trait on the selected images.
 */
export async function setImageFacets(categoryId, paths, assignments) {
  const cat = category(categoryId);
  if (!cat || !paths.length) return;

  const draft = draftOverlay();
  const entry = ensureOverlayCategory(draft, categoryId);
  const targets = new Set(paths);

  // Any new value must exist on its trait, or the filter chips will not offer it.
  for (const [facetId, values] of Object.entries(assignments)) {
    if (!values?.length) continue;
    const facet = ensureOverlayFacet(draft, facetId);
    for (const value of values) {
      if (!facet.values.includes(value)) facet.values.push(value);
    }
  }

  for (const image of cat.images) {
    if (!targets.has(image.path)) continue;
    if (image.readOnly) continue; // Art-pack images are not ours to rewrite.
    const record = overlayRecordFor(entry, image);
    for (const [facetId, values] of Object.entries(assignments)) {
      if (values?.length) record.facets[facetId] = [...new Set(values)];
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

/**
 * Merge the shipped D&D/Pathfinder starter set into the overlay.
 *
 * Purely additive: an existing category keeps its label and gains only match
 * names it does not already have, and existing trait values are never removed.
 * Running it twice is a no-op, so it is safe to offer as a button rather than a
 * one-shot first-run migration.
 *
 * @returns {Promise<{categories: number, facets: number}>} How much was added.
 */
export async function seedDefaults() {
  const { DEFAULT_CATEGORIES, DEFAULT_FACETS } = await import('../data/default-categories.js');
  const draft = draftOverlay();

  let addedCategories = 0;
  let addedFacets = 0;

  for (const facet of DEFAULT_FACETS) {
    const entry = ensureOverlayFacet(draft, facet.id, facet.label);
    for (const value of facet.values) {
      if (!entry.values.includes(value)) {
        entry.values.push(value);
        addedFacets++;
      }
    }
  }

  for (const preset of DEFAULT_CATEGORIES) {
    const known = category(preset.id);
    const entry = ensureOverlayCategory(draft, preset.id);
    if (!known) {
      entry.label = preset.label;
      addedCategories++;
    }
    for (const name of preset.names) {
      if (!entry.match.names.includes(name)) entry.match.names.push(name);
    }
    for (const type of preset.creatureTypes ?? []) {
      if (!entry.match.creatureTypes.includes(type)) entry.match.creatureTypes.push(type);
    }
  }

  await commit(draft);
  log.log(`seeded defaults: ${addedCategories} new categories, ${addedFacets} new trait values`);
  return { categories: addedCategories, facets: addedFacets };
}

/** Announce that the library is queryable. Called once from main.js. */
export function announceReady() {
  Hooks.callAll(HOOK_READY, {
    categories: state.categories.size,
    images: imageCount(),
  });
}
