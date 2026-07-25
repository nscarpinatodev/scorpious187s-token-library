/**
 * Access to scorpious187s-lib.
 *
 * The library is a separate Foundry module, so its exports are only reachable
 * at runtime through `game.modules.get(id).api` — which is populated during the
 * lib's own init hook. Nothing here may be called at module-evaluation time.
 */

import { LIB_ID } from '../constants.js';

/** @returns {object|null} The lib's frozen API, or null if it is not active. */
export function libApi() {
  return game?.modules?.get(LIB_ID)?.api ?? null;
}

/** @returns {boolean} True when the lib is installed and active. */
export function hasLib() {
  return !!libApi();
}

/** Shorthand for the lib's utils namespace. */
export function libUtils() {
  return libApi()?.utils ?? null;
}
