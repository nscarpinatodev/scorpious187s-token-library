/**
 * Thin wrappers over Foundry's file API.
 *
 * Worth knowing: there is no server-side copy or move. FilePicker exposes only
 * browse / createDirectory / upload (client/applications/apps/file-picker.mjs),
 * so "copying" a file means fetching it into a Blob and POSTing it back — one
 * request per file. Everything here is built around keeping that cost visible
 * and bounded rather than hiding it.
 */

import { IMAGE_EXTENSIONS, UPLOAD_CONCURRENCY } from '../constants.js';
import { join, basename, decodePath } from './paths.js';
import { log } from '../logger.js';

/** The FilePicker class, via the v13+ namespaced location with a fallback. */
function picker() {
  return foundry.applications?.apps?.FilePicker?.implementation
    ?? globalThis.FilePicker;
}

/**
 * List a directory. Returns empty results instead of throwing when the
 * directory does not exist yet, which is the common case on a fresh install.
 * @returns {Promise<{dirs: string[], files: string[]}>}
 */
export async function browse(source, path, options = {}) {
  try {
    const result = await picker().browse(source, path, options);
    // Decoded at the boundary so no caller ever has to think about it.
    return {
      dirs: (result?.dirs ?? []).map(decodePath),
      files: (result?.files ?? []).map(decodePath),
    };
  } catch (err) {
    log.debug(`browse failed for "${path}":`, err?.message ?? err);
    return { dirs: [], files: [] };
  }
}

/** List only image files in a directory. */
export async function browseImages(source, path) {
  const { files } = await browse(source, path, { extensions: IMAGE_EXTENSIONS.map(e => `.${e}`) });
  return files.filter(f => IMAGE_EXTENSIONS.includes(f.split('.').pop()?.toLowerCase()));
}

/** True when a directory exists and is readable. */
export async function directoryExists(source, path) {
  try {
    await picker().browse(source, path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Create a directory and every missing parent. Existing directories are not an
 * error — Foundry rejects with EEXIST, which we swallow.
 */
export async function ensureDir(source, path) {
  const segments = String(path).split('/').filter(Boolean);
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    try {
      await picker().createDirectory(source, current);
    } catch (err) {
      const message = String(err?.message ?? err);
      if (!/EEXIST|already exists/i.test(message)) {
        log.debug(`createDirectory("${current}"):`, message);
      }
    }
  }
  return path;
}

/**
 * Upload a Blob under a specific filename.
 *
 * FormData names an unwrapped Blob "blob", so the Blob must be wrapped in a
 * File to land with the name we want (file-picker.mjs sets `fd.set("upload", file)`).
 * @returns {Promise<string|null>} The stored path, or null on failure.
 */
export async function uploadBlob(source, dir, filename, blob, { notify = false } = {}) {
  await ensureDir(source, dir);
  const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' });
  const response = await picker().upload(source, dir, file, {}, { notify });
  if (!response?.path) {
    log.warn(`upload failed: ${join(dir, filename)}`);
    return null;
  }
  return decodePath(response.path);
}

/** Upload a JSON-serialisable object as a pretty-printed .json file. */
export async function uploadJson(source, dir, filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  return uploadBlob(source, dir, filename, blob);
}

/**
 * Read and parse a JSON file from a served path.
 * @returns {Promise<object|null>} null when absent or unparseable.
 */
export async function readJson(path) {
  try {
    const response = await fetch(`${foundry.utils.getRoute(path)}?t=${Date.now()}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (err) {
    log.debug(`readJson("${path}") failed:`, err?.message ?? err);
    return null;
  }
}

/** Fetch any served file as a Blob. */
export async function readBlob(path) {
  const response = await fetch(foundry.utils.getRoute(path));
  if (!response.ok) throw new Error(`fetch ${path} → ${response.status}`);
  return response.blob();
}

/**
 * Copy one file by round-tripping it through the client. Slow by nature; use
 * copyFiles() for anything more than a handful.
 */
export async function copyFile(sourcePath, destSource, destDir, filename = null) {
  const blob = await readBlob(sourcePath);
  return uploadBlob(destSource, destDir, filename ?? basename(sourcePath), blob);
}

/**
 * Copy many files with bounded concurrency and progress reporting.
 *
 * @param {Array<{from: string, dir: string, filename?: string}>} entries
 * @param {string} destSource
 * @param {object} [options]
 * @param {(done: number, total: number, entry: object) => void} [options.onProgress]
 * @param {() => boolean} [options.shouldStop] Polled between files to allow cancelling.
 * @returns {Promise<{copied: string[], failed: Array<{entry: object, error: string}>}>}
 */
export async function copyFiles(entries, destSource, { onProgress, shouldStop } = {}) {
  const copied = [];
  const failed = [];
  let done = 0;
  let index = 0;

  const worker = async () => {
    while (index < entries.length) {
      if (shouldStop?.()) return;
      const entry = entries[index++];
      try {
        const path = await copyFile(entry.from, destSource, entry.dir, entry.filename);
        if (path) copied.push(path);
        else failed.push({ entry, error: 'upload rejected' });
      } catch (err) {
        failed.push({ entry, error: String(err?.message ?? err) });
      }
      onProgress?.(++done, entries.length, entry);
    }
  };

  const workers = Array.from(
    { length: Math.min(UPLOAD_CONCURRENCY, entries.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return { copied, failed };
}
