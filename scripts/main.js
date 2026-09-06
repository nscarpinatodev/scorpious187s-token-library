/**
 * Scorpious187's Token Library — entry point.
 * Foundry VTT v13/v14.
 *
 * Follows the family's init/ready shape rather than the lib's registerModule()
 * bootstrap: the lib publishes its API from inside its own init hook, so it is
 * not reachable at module-evaluation time, which is when registerModule() would
 * have to run. Reading `game.modules.get(LIB_ID).api` from our init works
 * because Foundry loads declared dependencies first.
 */

import {
  MODULE_ID, LIB_ID, SETTINGS, HOOK_PATH_CHANGED,
} from './constants.js';
import { registerSettings, noteCurrentPath } from './settings.js';
import {
  build, categories, category, imageCount, announceReady, isBuilt, seedDefaults,
} from './library/index.js';
import { matchCategory, savedSelection } from './library/matching.js';
import { applyToActor, applyToTokens, ringMode } from './ring/apply.js';
import { warmCache, invalidateCache, needsProcessing } from './ring/bake.js';
import { ensureLibraryTree, resumeInterruptedRelocation, runWithProgress } from './storage/relocate.js';
import { browseImages } from './storage/files.js';
import { framesDir, source } from './storage/paths.js';
import { registerAutoApply } from './hooks/auto-apply.js';
import { openBrowser, TokenLibraryBrowser } from './apps/browser.js';
import { CategoryEditor } from './apps/category-editor.js';
import { TraitEditor } from './apps/trait-editor.js';
import { ImportDialog } from './apps/import-dialog.js';
import { registerFrameSource, available as tokenizerAvailable } from './integrations/tokenizer2.js';
import { libApi } from './integrations/lib.js';
import { log } from './logger.js';

/** Punch theme values through Foundry's high-specificity window chrome. */
const INLINE_THEME_TARGETS = [
  ['.stl-window',   'var(--stl-bg-secondary)', 'var(--stl-text-primary)'],
  ['.stl-sidebar',  'var(--stl-bg-primary)',   null],
  ['.stl-main',     'var(--stl-bg-secondary)', null],
];

let libMissing = false;

/**
 * Whether the module is in a state where its entry points should do anything.
 *
 * The hooks below are registered at module scope, so they fire even on the init
 * path that bailed out for a missing lib — and every one of them leads to the
 * browser, which reads settings that were never registered. Foundry normally
 * refuses to enable us without the lib, so this is a backstop rather than a
 * routine path.
 */
function operational() {
  return !libMissing && game.user?.isGM === true;
}

// ── Init ─────────────────────────────────────────────────────────────────────

Hooks.once('init', () => {
  const lib = libApi();
  if (!lib) {
    libMissing = true;
    Hooks.once('ready', () => ui.notifications.error(
      `${MODULE_ID} requires the "Scorpious187's Module Library" (${LIB_ID}) module. `
      + 'Please install and enable it.'));
    return;
  }

  registerSettings();
  lib.utils.registerHelpers('stl');

  lib.theming.register({
    moduleId: MODULE_ID,
    prefix: '--stl-',
    windowClass: 'stl-window',
    inlineTargets: INLINE_THEME_TARGETS,
  });

  registerAutoApply();
  log.log('Initialized');
});

// ── Ready ────────────────────────────────────────────────────────────────────

Hooks.once('ready', async () => {
  if (libMissing) return;

  const lib = libApi();
  await lib.utils.preloadTemplates(MODULE_ID, [
    'browser.hbs', 'category-editor.hbs', 'trait-editor.hbs', 'import-dialog.hbs',
    'bake-progress.hbs',
  ]);

  noteCurrentPath();

  if (game.user.isGM) {
    await ensureLibraryTree();
    await resumeInterruptedRelocation();
  }

  await build();

  // preCreateToken has to answer "is the processed file there?" synchronously,
  // so pre-list the variant directories now. Both modes can need this: frame
  // mode composites, dynamic mode masks the subject to the ring's circle.
  if (needsProcessing()) {
    await warmCache(categories().map(c => c.id));
  }

  // Offer the library's frames inside Tokenizer's own picker, so the GM sees
  // one set of frames wherever they are working.
  if (tokenizerAvailable()) {
    registerFrameSource(MODULE_ID, game.i18n.localize('STL.Frames.SectionLabel'), async () => {
      const files = await browseImages(source(), framesDir());
      return files.map(src => ({ src, label: src.split('/').pop().replace(/\.\w+$/, '') }));
    });
  } else {
    log.warn('Tokenizer 2 is unavailable — frame baking and the import round-trip are disabled');
  }

  registerTokenHudButton();
  announceReady();

  game.modules.get(MODULE_ID).api = Object.freeze({
    openBrowser,
    TokenLibraryBrowser,
    CategoryEditor,
    TraitEditor,
    ImportDialog,
    library: { build, categories, category, imageCount, isBuilt, seedDefaults },
    matching: { matchCategory, savedSelection },
    apply: { applyToActor, applyToTokens, ringMode },
    storage: { ensureLibraryTree, relocate: runWithProgress },
  });

  log.log(`Ready — ${categories().length} categories, ${imageCount()} images`);
});

// ── Reacting to settings changes ─────────────────────────────────────────────

/** Moving the library root means physically copying its contents. */
Hooks.on(HOOK_PATH_CHANGED, async (newPath, previousPath) => {
  if (!game.user.isGM || !previousPath || previousPath === newPath) return;
  log.log(`library root changed: ${previousPath} → ${newPath}`);
  await runWithProgress(previousPath);
  invalidateCache();
  await build();
});

/** A different frame, mask, mode, or format changes which variant files apply. */
Hooks.on('updateSetting', async (setting) => {
  if (!setting?.key?.startsWith(`${MODULE_ID}.`)) return;
  const key = setting.key.split('.').slice(1).join('.');
  const relevant = [
    SETTINGS.FRAME_SRC, SETTINGS.MASK_MODE, SETTINGS.RING_MASK, SETTINGS.SUBJECT_FIT,
    SETTINGS.RING_MODE, SETTINGS.EXPORT_FORMAT,
  ];
  if (!relevant.includes(key)) return;

  invalidateCache();
  if (needsProcessing() && isBuilt()) {
    await warmCache(categories().map(c => c.id));
  }
});

// ── Entry points ─────────────────────────────────────────────────────────────

/** Token layer control, so the browser is reachable without a token selected. */
Hooks.on('getSceneControlButtons', (controls) => {
  if (!operational()) return;

  // Only onChange. SceneControls#onChange invokes onChange *and* the deprecated
  // onClick for the same activation, so registering both opens the browser
  // twice — two apps sharing one DOM id, the second detaching the first's
  // element and blowing up _updatePosition.
  const tool = {
    name: 'stl-browser',
    title: 'STL.Browser.Title',
    icon: 'fas fa-images',
    button: true,
    visible: true,
    order: 100,
    onChange: () => openBrowser(),
  };

  // v13 reshaped controls from an array into a record of control groups.
  if (Array.isArray(controls)) {
    controls.find(c => c.name === 'token' || c.name === 'tokens')?.tools.push(tool);
  } else if (controls.tokens) {
    controls.tokens.tools[tool.name] = tool;
  }
});

/** Header control on ApplicationV2 actor sheets (v13+). */
Hooks.on('getHeaderControlsApplicationV2', (app, controls) => {
  const actor = app?.document;
  if (!actor || actor.documentName !== 'Actor' || !operational()) return;
  controls.push({
    icon: 'fas fa-images',
    label: 'STL.Browser.OpenForActor',
    action: 'stlOpenBrowser',
    onClick: () => openBrowser({ actor }),
  });
});

/** Header button on legacy Application actor sheets. */
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  const actor = sheet.actor ?? sheet.document;
  if (!actor || !operational()) return;
  buttons.unshift({
    label: game.i18n.localize('STL.Browser.OpenForActor'),
    class: 'stl-open-browser',
    icon: 'fas fa-images',
    onclick: () => openBrowser({ actor }),
  });
});

/** Token HUD button, using the lib's version-normalised injector. */
function registerTokenHudButton() {
  const addTokenHudButton = libApi()?.utils?.addTokenHudButton;
  if (!addTokenHudButton) return;
  addTokenHudButton({
    cssClass: 'stl-hud-library',
    icon: 'fas fa-images',
    tooltip: game.i18n.localize('STL.Browser.OpenForActor'),
    condition: () => operational(),
    onClick: (actor) => openBrowser({ actor }),
  });
}

/** Actor directory context menu. */
function addActorContext(options) {
  options.push({
    name: game.i18n.localize('STL.Browser.OpenForActor'),
    icon: '<i class="fas fa-images"></i>',
    condition: () => operational(),
    callback: (li) => {
      const el = li?.dataset ? li : (li?.[0] ?? li?.currentTarget ?? null);
      const id = el?.dataset?.documentId ?? el?.dataset?.entryId
        ?? el?.closest?.('[data-entry-id],[data-document-id]')?.dataset?.entryId;
      const actor = id ? game.actors.get(id) : null;
      if (actor) openBrowser({ actor });
    },
  });
}
Hooks.on('getActorDirectoryEntryContext', (html, options) => addActorContext(options));
Hooks.on('getActorContextOptions', (directory, options) => addActorContext(options));
