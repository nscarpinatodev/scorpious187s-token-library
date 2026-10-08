/**
 * Access to scorpious187s-lib.
 *
 * The library is a separate Foundry module, so its exports are only reachable
 * at runtime through `game.modules.get(id).api` — which is populated during the
 * lib's own init hook. Nothing here may be called at module-evaluation time.
 */

import { LIB_ID } from '../constants.js';

/**
 * @returns {object|null} The lib's frozen API, or null if it is not active.
 *
 * Reached through globalThis because a bare `game?.` still throws when the
 * identifier is undeclared rather than undefined — which is the case before
 * Foundry sets it up, and anywhere this module is loaded outside Foundry.
 */
export function libApi() {
  return globalThis.game?.modules?.get(LIB_ID)?.api ?? null;
}

/** @returns {boolean} True when the lib is installed and active. */
export function hasLib() {
  return !!libApi();
}

/** Shorthand for the lib's utils namespace. */
export function libUtils() {
  return libApi()?.utils ?? null;
}

/**
 * Yes/no confirmation, preferring the lib's shared helper so the family's
 * dialogs look alike, with core DialogV2 as the fallback.
 * @returns {Promise<boolean>}
 */
export async function confirmDialog(title, content) {
  const dialogs = libUtils()?.dialogs;
  if (dialogs?.confirm) return dialogs.confirm(title, content);
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title }, content, rejectClose: false,
  });
  return result === true;
}
