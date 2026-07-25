/**
 * Dependency-free leaf module: constants only, so any file can import it
 * without creating circular-import temporal-dead-zone issues.
 */

export const MODULE_ID = 'scorpious187s-token-library';
export const MODULE_TITLE = "Scorpious187's Token Library";

/** Modules we integrate with. */
export const LIB_ID = 'scorpious187s-lib';
export const TOKENIZER_ID = 'tokenizer-2';

export const SETTINGS = Object.freeze({
  LIBRARY_PATH:   'libraryPath',
  LIBRARY_SOURCE: 'librarySource',
  RING_MODE:      'ringMode',
  FRAME_SRC:      'frameSrc',
  RING_SCALE:     'ringScale',
  RING_COLOR:     'ringColor',
  RING_BACKGROUND:'ringBackground',
  RING_EFFECTS:   'ringEffects',
  AUTO_APPLY:     'autoApply',
  AUTO_APPLY_LINKED: 'autoApplyLinked',
  EXPORT_SIZE:    'exportSize',
  EXPORT_FORMAT:  'exportFormat',
  DEBUG:          'debug',
});

/**
 * How a chosen image is turned into a rendered token.
 * DYNAMIC leaves ring.subject.texture blank on purpose so wildcards keep
 * randomising — see client/canvas/placeables/tokens/ring.mjs, which only
 * overrides the subject mesh when that field is truthy.
 */
export const RING_MODES = Object.freeze({
  DYNAMIC: 'dynamic',
  FRAME:   'frame',
});

/** Actor/token flags on this module's namespace. */
export const FLAGS = Object.freeze({
  /** The GM's saved browser selection: {categoryId, facets, file|null, wildcard}. */
  SELECTION: 'selection',
  /** Set on tokens we auto-applied, so we never fight a later manual change. */
  AUTO_APPLIED: 'autoApplied',
});

// ── Storage layout ───────────────────────────────────────────────────────────

export const STORAGE_SUBDIR = 'storage';

/** Default library root. Survives module updates thanks to persistentStorage. */
export const DEFAULT_ROOT = `modules/${MODULE_ID}/${STORAGE_SUBDIR}`;

export const DIRS = Object.freeze({
  /** Borderless subject art, one directory per category. */
  ART:    'art',
  /** Frame-mode composites: baked/<frameId>/<categoryId>/<file>. Derived, disposable. */
  BAKED:  'baked',
  /** GM-supplied frame images. */
  FRAMES: 'frames',
});

export const MANIFEST_FILE = 'manifest.json';
export const MANIFEST_VERSION = 1;

/** Marker file written after a relocation copy so it can resume after a reload. */
export const RELOCATE_STATE_FILE = '.relocate-state.json';

// ── Hooks we fire ────────────────────────────────────────────────────────────

/** Fired once the library index is built and queryable. */
export const HOOK_READY = `${MODULE_ID}.ready`;
/** Fired whenever the manifest changes (images, categories, or facets). */
export const HOOK_CHANGED = `${MODULE_ID}.changed`;
/**
 * Fired with (newPath, previousPath) when the GM moves the library root.
 * Settings cannot import the relocation code without a circular import, so the
 * setting announces the change and main.js decides what to do about it.
 */
export const HOOK_PATH_CHANGED = `${MODULE_ID}.libraryPathChanged`;

// ── Art packs ────────────────────────────────────────────────────────────────

/**
 * A companion art module advertises itself with this flag block:
 *
 *   "flags": {
 *     "scorpious187s-token-library": { "artPack": true, "manifest": "manifest.json" }
 *   }
 *
 * Its manifest uses the same schema as the GM overlay, with `file` paths
 * relative to the pack's own module root. Packs are read-only; GM edits always
 * land in the overlay.
 */
export const ART_PACK_FLAG = 'artPack';
export const ART_PACK_MANIFEST_FLAG = 'manifest';

// ── Misc ─────────────────────────────────────────────────────────────────────

export const IMAGE_EXTENSIONS = Object.freeze(['webp', 'png', 'jpg', 'jpeg', 'avif', 'svg']);

/** Uploads are one HTTP POST each; keep concurrency modest so the server copes. */
export const UPLOAD_CONCURRENCY = 4;
