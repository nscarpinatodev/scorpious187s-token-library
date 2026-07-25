/**
 * World and client settings.
 *
 * Registered from init via the lib's registerModule bootstrap. Anything that
 * changes what lands on a token is world-scoped so every client agrees;
 * `debug` is the only client-scoped setting, matching the family convention
 * that makeLogger() reads.
 */

import {
  MODULE_ID, SETTINGS, DEFAULT_ROOT, RING_MODES, HOOK_PATH_CHANGED, MASK_MODES, SUBJECT_FITS,
} from './constants.js';

/**
 * The library root as it was last seen. A setting's onChange only receives the
 * new value, but relocation needs to know where the files currently are.
 */
let lastKnownPath = null;

/** Record the current root. Called on ready, before anything can change it. */
export function noteCurrentPath() {
  lastKnownPath = game.settings.get(MODULE_ID, SETTINGS.LIBRARY_PATH);
}

/** Named dynamic-ring effect combinations, resolved to a bitmask at apply time. */
export const RING_EFFECT_PRESETS = Object.freeze({
  none:           ['ENABLED'],
  pulse:          ['ENABLED', 'RING_PULSE'],
  gradient:       ['ENABLED', 'RING_GRADIENT'],
  wave:           ['ENABLED', 'BKG_WAVE'],
  pulseGradient:  ['ENABLED', 'RING_PULSE', 'RING_GRADIENT'],
});

/**
 * Resolve a preset id to the numeric bitmask Foundry stores in ring.effects.
 * Reads the flags off the live ring class so we never hardcode bit values.
 * @param {string} presetId
 * @returns {number}
 */
export function resolveRingEffects(presetId) {
  const flags = CONFIG.Token?.ring?.ringClass?.effects ?? {};
  const names = RING_EFFECT_PRESETS[presetId] ?? RING_EFFECT_PRESETS.none;
  return names.reduce((mask, name) => mask | (flags[name] ?? 0), 0) || 1;
}

export function registerSettings() {
  const t = (key) => game.i18n.localize(`STL.Settings.${key}`);

  // ── Storage ────────────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.LIBRARY_PATH, {
    name: t('LibraryPath'),
    hint: t('LibraryPathHint'),
    scope: 'world',
    config: true,
    type: String,
    filePicker: 'folder',
    default: DEFAULT_ROOT,
    onChange: (value) => {
      const previous = lastKnownPath;
      lastKnownPath = value;
      Hooks.callAll(HOOK_PATH_CHANGED, value, previous);
    },
  });

  game.settings.register(MODULE_ID, SETTINGS.LIBRARY_SOURCE, {
    name: t('LibrarySource'),
    hint: t('LibrarySourceHint'),
    scope: 'world',
    config: true,
    type: String,
    default: 'data',
  });

  // ── Ring presentation ──────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.RING_MODE, {
    name: t('RingMode'),
    hint: t('RingModeHint'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      [RING_MODES.DYNAMIC]: t('RingModeDynamic'),
      [RING_MODES.FRAME]:   t('RingModeFrame'),
    },
    default: RING_MODES.DYNAMIC,
  });

  game.settings.register(MODULE_ID, SETTINGS.FRAME_SRC, {
    name: t('FrameSrc'),
    hint: t('FrameSrcHint'),
    scope: 'world',
    config: true,
    type: String,
    filePicker: 'image',
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.SUBJECT_FIT, {
    name: t('SubjectFit'),
    hint: t('SubjectFitHint'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      [SUBJECT_FITS.COVER_TOP]: t('SubjectFitCoverTop'),
      [SUBJECT_FITS.COVER]:     t('SubjectFitCover'),
      [SUBJECT_FITS.CONTAIN]:   t('SubjectFitContain'),
    },
    default: SUBJECT_FITS.COVER_TOP,
  });

  game.settings.register(MODULE_ID, SETTINGS.MASK_MODE, {
    name: t('MaskMode'),
    hint: t('MaskModeHint'),
    scope: 'world',
    config: true,
    type: String,
    choices: {
      [MASK_MODES.CIRCLE]: t('MaskModeCircle'),
      [MASK_MODES.IMAGE]:  t('MaskModeImage'),
      [MASK_MODES.NONE]:   t('MaskModeNone'),
    },
    default: MASK_MODES.CIRCLE,
  });

  game.settings.register(MODULE_ID, SETTINGS.RING_MASK, {
    name: t('RingMask'),
    hint: t('RingMaskHint'),
    scope: 'world',
    config: true,
    type: String,
    filePicker: 'image',
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.RING_SCALE, {
    name: t('RingScale'),
    hint: t('RingScaleHint'),
    scope: 'world',
    config: true,
    type: Number,
    range: { min: 0.5, max: 1.5, step: 0.05 },
    // 1 matches what Tokenizer 2 writes. The artwork is already clipped to the
    // ring's subject size during processing, so scaling it again here shrinks
    // it away from the ring rather than fitting it.
    default: 1,
  });

  game.settings.register(MODULE_ID, SETTINGS.RING_COLOR, {
    name: t('RingColor'),
    hint: t('RingColorHint'),
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.RING_BACKGROUND, {
    name: t('RingBackground'),
    hint: t('RingBackgroundHint'),
    scope: 'world',
    config: true,
    type: String,
    default: '',
  });

  game.settings.register(MODULE_ID, SETTINGS.RING_EFFECTS, {
    name: t('RingEffects'),
    hint: t('RingEffectsHint'),
    scope: 'world',
    config: true,
    type: String,
    choices: Object.fromEntries(
      Object.keys(RING_EFFECT_PRESETS).map(id => [id, t(`RingEffects${id[0].toUpperCase()}${id.slice(1)}`)]),
    ),
    default: 'none',
  });

  // ── Automatic application ──────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.AUTO_APPLY, {
    name: t('AutoApply'),
    hint: t('AutoApplyHint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  });

  game.settings.register(MODULE_ID, SETTINGS.AUTO_APPLY_LINKED, {
    name: t('AutoApplyLinked'),
    hint: t('AutoApplyLinkedHint'),
    scope: 'world',
    config: true,
    type: Boolean,
    default: false,
  });

  // ── Bake output ────────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.EXPORT_SIZE, {
    name: t('ExportSize'),
    hint: t('ExportSizeHint'),
    scope: 'world',
    config: true,
    type: Number,
    choices: { 256: '256', 400: '400', 512: '512', 1024: '1024' },
    default: 512,
  });

  game.settings.register(MODULE_ID, SETTINGS.EXPORT_FORMAT, {
    name: t('ExportFormat'),
    hint: t('ExportFormatHint'),
    scope: 'world',
    config: true,
    type: String,
    choices: { webp: 'WebP', png: 'PNG' },
    default: 'webp',
  });

  // ── Browser ────────────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.THUMBNAIL_SIZE, {
    name: t('ThumbnailSize'),
    hint: t('ThumbnailSizeHint'),
    scope: 'client',
    config: true,
    type: Number,
    choices: { 96: '96px', 128: '128px', 192: '192px', 256: '256px' },
    default: 256,
  });

  // ── Developer ──────────────────────────────────────────────────────────────

  game.settings.register(MODULE_ID, SETTINGS.DEBUG, {
    name: t('Debug'),
    hint: t('DebugHint'),
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });
}

/** Convenience reader — `get(SETTINGS.RING_MODE)`. */
export function get(key) {
  return game.settings.get(MODULE_ID, key);
}
