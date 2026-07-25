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
 * Composite an art image and return the result as a Blob.
 *
 * This is the actorless path — exportLayers() takes a layer stack and hands
 * back {blob, dataURL}, which is exactly what bulk processing needs.
 *
 * Both presentation modes come through here:
 *   • frame mode passes a frameSrc, which is stacked over the art;
 *   • dynamic-ring mode passes a maskSrc, which clips the art to the ring's
 *     inner circle so a square portrait does not spill outside the ring.
 *     Tokenizer's own auto-tokenize does the same thing — it hands `maskSrc`
 *     to tokenize() alongside forceDynamicRing.
 *
 * @param {string} artSrc Full path to the source artwork.
 * @param {object} [options]
 * @param {string|null} [options.frameSrc]  Frame stacked above the art.
 * @param {string|null} [options.maskSrc]   Mask clipping the art.
 * @param {number} [options.exportSize]
 * @param {string} [options.exportFormat]   "webp" | "png"
 * @returns {Promise<Blob>}
 */
export async function compositeToBlob(artSrc, { frameSrc = null, maskSrc = null, exportSize, exportFormat } = {}) {
  const tokenizer = api();
  if (!tokenizer) throw new Error('Tokenizer 2 is not available');

  const art = tokenizer.createImageLayer(artSrc, 'Art');

  if (maskSrc) {
    // Tokenizer's layer masks are {id, type, src, ringConfig}; "custom" is the
    // general image-mask type its own applyCustomMasks() uses.
    art.masks.push({
      id: foundry.utils.randomID(),
      type: 'custom',
      src: maskSrc,
      ringConfig: null,
    });
  }

  const layers = [art];
  if (frameSrc) layers.push(tokenizer.createImageLayer(frameSrc, 'Frame'));

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
