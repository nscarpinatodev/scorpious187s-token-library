/**
 * Tokenizer 2 integration.
 *
 * Tokenizer 2 does every pixel operation this module needs, so we never write
 * compositing code of our own. Its API is published on both `window.Tokenizer2`
 * and `game.modules.get("tokenizer-2").api` once its init has run:
 *
 *   tokenize(actor, options)      composite + save + write the actor
 *   exportLayers(layers, options) composite to a Blob with no actor involved
 *   createImageLayer(src, label)  layer factory
 *   createRingLayer(options)      layer factory
 *   frameRegistry                 frame/mask browser registry
 *   registerCustomFrame(frame)    add a frame to Tokenizer's own picker
 *
 * Verified against Tokenizer 2 v1.2.4.
 */

import { TOKENIZER_ID } from '../constants.js';
import { log } from '../logger.js';

/** @returns {object|null} The Tokenizer 2 API, or null when unavailable. */
export function api() {
  const mod = game?.modules?.get(TOKENIZER_ID);
  if (!mod?.active) return null;
  return mod.api ?? globalThis.Tokenizer2 ?? null;
}

/** True when Tokenizer 2 is installed, active, and has published its API. */
export function available() {
  return !!api();
}

/**
 * Guard for features that genuinely cannot work without Tokenizer 2 (frame
 * baking, the import round-trip). Dynamic ring mode never needs it.
 * @param {string} feature Localised feature name for the notification.
 * @returns {boolean} True when it is safe to proceed.
 */
export function requireTokenizer(feature) {
  if (available()) return true;
  ui.notifications?.warn(game.i18n.format('STL.Warn.TokenizerRequired', { feature }));
  log.warn(`"${feature}" needs Tokenizer 2, which is not available`);
  return false;
}

/**
 * Composite an art image onto a frame and return the result as a Blob.
 *
 * This is the actorless path — exportLayers() takes a layer stack and hands
 * back {blob, dataURL}, which is exactly what bulk baking needs.
 *
 * @param {string} artSrc   Full path to the borderless subject art.
 * @param {string} frameSrc Full path to the frame image.
 * @param {object} [options]
 * @param {number} [options.exportSize]
 * @param {string} [options.exportFormat] "webp" | "png"
 * @returns {Promise<Blob>}
 */
export async function compositeToBlob(artSrc, frameSrc, { exportSize, exportFormat } = {}) {
  const tokenizer = api();
  if (!tokenizer) throw new Error('Tokenizer 2 is not available');

  const layers = [
    tokenizer.createImageLayer(artSrc, 'Art'),
    tokenizer.createImageLayer(frameSrc, 'Frame'),
  ];

  const { blob } = await tokenizer.exportLayers(layers, { exportSize, exportFormat });
  if (!blob) throw new Error(`compositing produced no output for ${artSrc}`);
  return blob;
}

/**
 * Hand a single actor to Tokenizer 2 to composite, save, and write.
 *
 * Used for one-off applies in frame mode: Tokenizer already knows how to place
 * the file and patch the prototype token, so delegating avoids duplicating that
 * logic. `wildcardMode: "keep"` leaves an existing randomImg setup intact.
 *
 * @param {Actor} actor
 * @param {object} options Passed through to Tokenizer's tokenize().
 */
export async function tokenizeActor(actor, options) {
  const tokenizer = api();
  if (!tokenizer) throw new Error('Tokenizer 2 is not available');
  return tokenizer.tokenize(actor, { wildcardMode: 'keep', ...options });
}

/** Open Tokenizer's editor for an actor, resolving with the saved path. */
export async function openEditorForActor(actor, options = {}) {
  const tokenizer = api();
  if (!tokenizer) throw new Error('Tokenizer 2 is not available');

  return new Promise((resolve) => {
    const hookId = Hooks.on(`${TOKENIZER_ID}.postSave`, (data) => {
      if (data?.actor?.id !== actor.id) return;
      Hooks.off(`${TOKENIZER_ID}.postSave`, hookId);
      resolve(data.path ?? null);
    });
    try {
      tokenizer.openEditor(actor, options);
    } catch (err) {
      Hooks.off(`${TOKENIZER_ID}.postSave`, hookId);
      log.error('failed to open the Tokenizer 2 editor:', err);
      resolve(null);
    }
  });
}

/**
 * Surface the library's own frames inside Tokenizer's frame browser, so the
 * GM sees one set of frames wherever they are working.
 * @param {() => Promise<Array<{src: string, label: string}>>} load
 */
export function registerFrameSource(id, label, load) {
  const registry = api()?.frameRegistry;
  if (!registry?.registerLoader) return false;
  registry.registerLoader({ id, kind: 'frame', label, load });
  return true;
}
