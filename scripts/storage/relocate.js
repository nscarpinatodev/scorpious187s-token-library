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

import { DIRS, RELOCATE_STATE_FILE, MANIFEST_FILE } from '../constants.js';
import { root, source, join, framesDir, trimSlashes } from './paths.js';
import {
  ensureDir, browse, browseImages, copyFiles, readJson, uploadJson,
} from './files.js';
import { libApi } from '../integrations/lib.js';
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
 * Enumerate every file that would need copying out of an old root.
 * @returns {Promise<Array<{from: string, dir: string}>>}
 */
async function planCopy(fromRoot, toRoot) {
  const src = source();
  const entries = [];

  const manifest = join(fromRoot, MANIFEST_FILE);
  const { files: rootFiles } = await browse(src, fromRoot);
  if (rootFiles.includes(manifest)) entries.push({ from: manifest, dir: toRoot });

  // Art, one directory per category.
  const { dirs: artDirs } = await browse(src, join(fromRoot, DIRS.ART));
  for (const dir of artDirs) {
    const name = trimSlashes(dir).split('/').pop();
    for (const file of await browseImages(src, dir)) {
      entries.push({ from: file, dir: join(toRoot, DIRS.ART, name) });
    }
  }

  // Frames.
  for (const file of await browseImages(src, join(fromRoot, DIRS.FRAMES))) {
    entries.push({ from: file, dir: join(toRoot, DIRS.FRAMES) });
  }

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
 */
export async function relocate(fromRoot, { onProgress, shouldStop } = {}) {
  const toRoot = root();
  if (trimSlashes(fromRoot) === trimSlashes(toRoot)) return { copied: [], failed: [] };

  await ensureLibraryTree();
  const entries = await planCopy(fromRoot, toRoot);
  if (!entries.length) {
    log.log(`nothing to copy from ${fromRoot}`);
    return { copied: [], failed: [] };
  }

  log.log(`relocating ${entries.length} file(s): ${fromRoot} → ${toRoot}`);

  // Record intent before starting, so an interrupted run can be resumed.
  await uploadJson(source(), toRoot, RELOCATE_STATE_FILE, {
    fromRoot, toRoot, total: entries.length, startedAt: Date.now(),
  });

  const result = await copyFiles(entries, source(), { onProgress, shouldStop });

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
 * Called on ready, GM only.
 */
export async function resumeInterruptedRelocation() {
  const state = await readJson(join(root(), RELOCATE_STATE_FILE));
  if (!state?.fromRoot || state.completedAt) return;

  const confirmed = await confirmDialog(
    game.i18n.localize('STL.Relocate.ResumeTitle'),
    game.i18n.format('STL.Relocate.ResumeMessage', { from: state.fromRoot, to: state.toRoot }),
  );
  if (!confirmed) return;

  await runWithProgress(state.fromRoot);
}

/**
 * Copy with a progress notification. Foundry's notification bar is enough here
 * — relocation is rare and the browser is usually not open during it.
 */
export async function runWithProgress(fromRoot) {
  let notification = ui.notifications?.info(
    game.i18n.format('STL.Relocate.Progress', { done: 0, total: '?' }),
    { permanent: true },
  );

  const result = await relocate(fromRoot, {
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
  ui.notifications?.info(game.i18n.format('STL.Relocate.Done', {
    count: result.copied.length,
    failed: result.failed.length,
  }));
  return result;
}

async function confirmDialog(title, content) {
  const dialogs = libApi()?.utils?.dialogs;
  if (dialogs?.confirm) return dialogs.confirm(title, content);
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title }, content, rejectClose: false,
  });
  return result === true;
}
