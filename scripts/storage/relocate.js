/**
 * Library root bootstrap and relocation.
 *
 * On a default install nothing is copied: the library already lives in the
 * module's persistent storage, which Foundry preserves across updates. A copy
 * only happens when the GM deliberately moves the library somewhere else — and
 * because Foundry has no server-side copy, that means one fetch plus one upload
 * per file, so it runs in batches, reports progress, and can resume after a
 * reload.
 */

import { DIRS, RELOCATE_STATE_FILE, MANIFEST_FILE, MAX_TREE_DEPTH } from '../constants.js';
import { root, source, join, framesDir, trimSlashes, basename } from './paths.js';
import {
  ensureDir, browse, browseImages, copyFiles, readJson, uploadJson,
} from './files.js';
import { confirmDialog } from '../integrations/lib.js';
import { log } from '../logger.js';

/** Create the directory skeleton if it is not already there. */
export async function ensureLibraryTree() {
  const src = source();
  await ensureDir(src, root());
  await ensureDir(src, join(root(), DIRS.ART));
  await ensureDir(src, join(root(), DIRS.BAKED));
  await ensureDir(src, framesDir());
  log.debug(`library tree ready at ${root()}`);
}

/**
 * Every image at or below `dir`, paired with the destination directory that
 * puts it back in the same place relative to the new root.
 *
 * Recursive because subfolders are not decoration: the scanner reads them as
 * traits (`art/guard/dwarf/male/` tags an image dwarf and male), so a copy that
 * flattened or skipped them would lose the tagging along with the files.
 *
 * `io` is injected so the walk can be exercised without a Foundry FilePicker;
 * production callers take the default.
 *
 * @returns {Promise<Array<{from: string, dir: string}>>}
 */
export async function planImageTree(
  src, fromRoot, toRoot, dir, depth = 0, io = { browse, browseImages },
) {
  const entries = [];
  const relative = trimSlashes(dir).slice(trimSlashes(fromRoot).length);
  const destination = join(toRoot, relative);

  for (const file of await io.browseImages(src, dir)) {
    entries.push({ from: file, dir: destination });
  }

  if (depth >= MAX_TREE_DEPTH) {
    log.warn(`stopped planning below ${dir} — nested more than ${MAX_TREE_DEPTH} deep`);
    return entries;
  }

  const { dirs } = await io.browse(src, dir);
  for (const sub of dirs) {
    entries.push(...await planImageTree(src, fromRoot, toRoot, sub, depth + 1, io));
  }
  return entries;
}

/**
 * Drop entries whose file is already at its destination.
 *
 * This is what makes a resume a resume: without it, picking an interrupted
 * move back up re-copied every file from the start, and a move that ended with
 * a few failures could only be retried by repeating all of it.
 *
 * One listing per destination directory. `io` is injectable for tests.
 * @param {Array<{from: string, dir: string, filename?: string}>} entries
 * @returns {Promise<Array<{from: string, dir: string, filename?: string}>>}
 */
export async function skipExisting(entries, src, io = { browse }) {
  const listings = new Map();
  const remaining = [];
  for (const entry of entries) {
    if (!listings.has(entry.dir)) {
      const { files } = await io.browse(src, entry.dir);
      listings.set(entry.dir, new Set(files));
    }
    const target = join(entry.dir, entry.filename ?? basename(entry.from));
    if (!listings.get(entry.dir).has(target)) remaining.push(entry);
  }
  return remaining;
}

/**
 * Enumerate every file that would need copying out of an old root.
 * @returns {Promise<Array<{from: string, dir: string}>>}
 */
async function planCopy(fromRoot, toRoot) {
  const src = source();
  const entries = [];

  const manifest = join(fromRoot, MANIFEST_FILE);
  const { files: rootFiles } = await browse(src, fromRoot);
  if (rootFiles.includes(manifest)) entries.push({ from: manifest, dir: toRoot });

  // Art and frames, at whatever depth they sit.
  entries.push(...await planImageTree(src, fromRoot, toRoot, join(fromRoot, DIRS.ART)));
  entries.push(...await planImageTree(src, fromRoot, toRoot, join(fromRoot, DIRS.FRAMES)));

  // Baked composites are a cache — cheaper to regenerate than to copy, so they
  // are deliberately left behind.
  return entries;
}

/**
 * Copy the library from one root to another.
 *
 * @param {string} fromRoot
 * @param {object} [options]
 * @param {(done: number, total: number) => void} [options.onProgress]
 * @param {() => boolean} [options.shouldStop]
 * @param {boolean} [options.resume] Finishing an interrupted move: skip every
 *        file already at the destination, the manifest included — it may have
 *        been edited at the new root since the move began. A fresh move copies
 *        everything, overwriting what is there, as it always has.
 */
export async function relocate(fromRoot, { onProgress, shouldStop, resume = false } = {}) {
  const toRoot = root();
  if (trimSlashes(fromRoot) === trimSlashes(toRoot)) return { copied: [], failed: [] };

  await ensureLibraryTree();
  const planned = await planCopy(fromRoot, toRoot);
  const entries = resume ? await skipExisting(planned, source()) : planned;
  if (!entries.length) {
    log.log(`nothing to copy from ${fromRoot}`);
    return { copied: [], failed: [] };
  }

  log.log(`relocating ${entries.length} of ${planned.length} file(s): ${fromRoot} → ${toRoot}`);

  // Record intent before starting, so an interrupted run can be resumed.
  await uploadJson(source(), toRoot, RELOCATE_STATE_FILE, {
    fromRoot, toRoot, total: entries.length, startedAt: Date.now(),
  });

  const result = await copyFiles(entries, source(), { onProgress, shouldStop });

  // Left unfinished on failure, so the next load offers to retry — and with
  // skipExisting() that retry copies only what is still missing.
  if (result.failed.length) {
    log.warn(`relocation finished with ${result.failed.length} failure(s)`);
  } else {
    await uploadJson(source(), toRoot, RELOCATE_STATE_FILE, { completedAt: Date.now(), fromRoot, toRoot });
    log.log(`relocation complete: ${result.copied.length} file(s) copied`);
  }
  return result;
}

/**
 * If a previous relocation was interrupted, offer to finish it.
 * Called once the module is ready, GM only, and not awaited there: the prompt
 * waits on the GM, and the library should not.
 * @returns {Promise<boolean>} True when files were copied, so the caller rebuilds.
 */
export async function resumeInterruptedRelocation() {
  const state = await readJson(join(root(), RELOCATE_STATE_FILE));
  if (!state?.fromRoot || state.completedAt) return false;

  const confirmed = await confirmDialog(
    game.i18n.localize('STL.Relocate.ResumeTitle'),
    game.i18n.format('STL.Relocate.ResumeMessage', { from: state.fromRoot, to: state.toRoot }),
  );
  if (!confirmed) return false;

  const result = await runWithProgress(state.fromRoot, { resume: true });
  return result.copied.length > 0;
}

/**
 * Copy with a progress notification. Foundry's notification bar is enough here
 * — relocation is rare and the browser is usually not open during it.
 */
export async function runWithProgress(fromRoot, { resume = false } = {}) {
  let notification = ui.notifications?.info(
    game.i18n.format('STL.Relocate.Progress', { done: 0, total: '?' }),
    { permanent: true },
  );

  const result = await relocate(fromRoot, {
    resume,
    onProgress: (done, total) => {
      if (done % 25 !== 0 && done !== total) return;
      if (notification?.remove) notification.remove();
      notification = ui.notifications?.info(
        game.i18n.format('STL.Relocate.Progress', { done, total }),
        { permanent: true },
      );
    },
  });

  if (notification?.remove) notification.remove();
  const done = game.i18n.format('STL.Relocate.Done', {
    count: result.copied.length,
    failed: result.failed.length,
  });
  if (result.failed.length) ui.notifications?.warn(done);
  else ui.notifications?.info(done);
  return result;
}
