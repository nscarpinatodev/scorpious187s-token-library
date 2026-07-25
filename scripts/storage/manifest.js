/**
 * manifest.json — the contract between the engine and whatever art it is
 * pointed at.
 *
 * Two kinds of manifest exist and they share one schema:
 *   • the GM overlay at <libraryRoot>/manifest.json — writable, authoritative
 *     for edits made in-game;
 *   • zero or more read-only art-pack manifests shipped by companion modules.
 *
 * They are *not* merged here, because each one's `file` paths are relative to a
 * different root. loadSources() returns them tagged with their root and
 * library/index.js resolves and merges them.
 */

import {
  MANIFEST_FILE, MANIFEST_VERSION, MODULE_ID,
  ART_PACK_FLAG, ART_PACK_MANIFEST_FLAG,
} from '../constants.js';
import { root, source, manifestPath, join, slugify, decodePath } from './paths.js';
import { readJson, uploadJson } from './files.js';
import { log } from '../logger.js';

/** An empty but valid manifest. */
export function defaultManifest() {
  return {
    version: MANIFEST_VERSION,
    facets: [],
    categories: [],
  };
}

/**
 * Coerce arbitrary JSON into the manifest shape, dropping anything malformed
 * rather than throwing — a hand-edited manifest should degrade, not brick the
 * module.
 */
export function normalize(raw) {
  const manifest = defaultManifest();
  if (!raw || typeof raw !== 'object') return manifest;

  manifest.version = Number(raw.version) || MANIFEST_VERSION;

  for (const facet of Array.isArray(raw.facets) ? raw.facets : []) {
    const id = slugify(facet?.id);
    if (!id) continue;
    manifest.facets.push({
      id,
      label: String(facet.label ?? id),
      values: [...new Set((Array.isArray(facet.values) ? facet.values : []).map(String).filter(Boolean))],
    });
  }

  for (const category of Array.isArray(raw.categories) ? raw.categories : []) {
    const id = slugify(category?.id);
    if (!id) continue;
    manifest.categories.push({
      id,
      label: String(category.label ?? id),
      match: {
        names: (Array.isArray(category.match?.names) ? category.match.names : []).map(String).filter(Boolean),
        creatureTypes: (Array.isArray(category.match?.creatureTypes) ? category.match.creatureTypes : [])
          .map(String).filter(Boolean),
      },
      images: normalizeImages(category.images),
    });
  }

  return manifest;
}

/**
 * A category's image entries, keyed canonically by decoded path.
 *
 * Entries used to be stored however the path happened to arrive, so the same
 * file could appear twice — once as "Seralyne%20Elven%20Ears.jpg" and once as
 * "Seralyne Elven Ears.jpg". Both resolve to one image at build time, the first
 * won, and edits written to the second silently vanished: tags looked like they
 * would not save.
 *
 * Paths are therefore decoded here, and duplicates collapse with **later
 * entries winning** — the file is an ordered log and edits are appended, so the
 * last write is the current one. A manifest carrying old duplicates heals
 * itself: they merge on load and are written back as a single entry.
 */
function normalizeImages(images) {
  const byFile = new Map();

  for (const image of Array.isArray(images) ? images : []) {
    if (!image?.file) continue;
    byFile.set(decodePath(String(image.file)), {
      file: decodePath(String(image.file)),
      // `external` marks a path that is already absolute within its file
      // source — art the GM linked from elsewhere in the data directory
      // rather than storing under the library root.
      external: image.external === true,
      // `removed` suppresses an image without touching the file. Foundry
      // exposes no delete API (file-picker.mjs offers only browse,
      // createDirectory and upload), and the directory scan would re-add
      // anything still on disk, so removal has to be recorded here.
      removed: image.removed === true,
      facets: normalizeImageFacets(image.facets),
    });
  }

  return [...byFile.values()];
}

/**
 * An image's traits, always as arrays.
 *
 * One trait held one value originally, which made "this token is both a guard
 * and a soldier" unexpressible. Older manifests wrote plain strings, so those
 * are widened here rather than migrated — the file is rewritten in the new
 * shape the next time anything is saved.
 *
 * @returns {Record<string, string[]>}
 */
function normalizeImageFacets(facets) {
  const out = {};
  if (!facets || typeof facets !== 'object') return out;
  for (const [facetId, raw] of Object.entries(facets)) {
    const values = [...new Set(
      (Array.isArray(raw) ? raw : [raw]).map(v => String(v ?? '').trim()).filter(Boolean),
    )];
    if (values.length) out[facetId] = values;
  }
  return out;
}

/** Read the GM overlay. Returns an empty manifest when none exists yet. */
export async function loadOverlay() {
  const raw = await readJson(manifestPath());
  if (!raw) log.debug('no overlay manifest yet — starting empty');
  return normalize(raw);
}

/** Write the GM overlay back to the library root. */
export async function saveOverlay(manifest) {
  const path = await uploadJson(source(), root(), MANIFEST_FILE, normalize(manifest));
  if (path) log.debug(`overlay manifest saved → ${path}`);
  else log.warn('failed to save the overlay manifest');
  return path;
}

/**
 * Active modules advertising themselves as art packs.
 * @returns {Array<{id: string, root: string, manifestPath: string}>}
 */
export function discoverArtPacks() {
  const packs = [];
  for (const mod of game.modules ?? []) {
    if (!mod.active) continue;
    const flags = mod.flags?.[MODULE_ID];
    if (!flags?.[ART_PACK_FLAG]) continue;
    const packRoot = `modules/${mod.id}`;
    packs.push({
      id: mod.id,
      root: packRoot,
      manifestPath: join(packRoot, flags[ART_PACK_MANIFEST_FLAG] ?? MANIFEST_FILE),
    });
  }
  return packs;
}

/**
 * Load every manifest that contributes to the library, tagged with the root its
 * `file` paths are relative to.
 *
 * @returns {Promise<Array<{id: string, root: string, readOnly: boolean, manifest: object}>>}
 *          Art packs first, GM overlay last — later entries win during merge.
 */
export async function loadSources() {
  const sources = [];

  for (const pack of discoverArtPacks()) {
    const raw = await readJson(pack.manifestPath);
    if (!raw) {
      log.warn(`art pack "${pack.id}" declares a manifest but none could be read at ${pack.manifestPath}`);
      continue;
    }
    sources.push({ id: pack.id, root: pack.root, readOnly: true, manifest: normalize(raw) });
    log.debug(`art pack loaded: ${pack.id}`);
  }

  sources.push({
    id: 'overlay',
    root: root(),
    readOnly: false,
    manifest: await loadOverlay(),
  });

  return sources;
}
