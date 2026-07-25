/**
 * Module logger.
 *
 * Prefers scorpious187s-lib's makeLogger so the whole family formats output the
 * same way, but resolves it lazily: this file is imported at page load, long
 * before the lib publishes its API on init. A local implementation with
 * identical behaviour covers that window (and the case where the lib is
 * missing entirely).
 */

import { MODULE_ID } from './constants.js';
import { libUtils } from './integrations/lib.js';

const PREFIX = `${MODULE_ID} |`;

const debugEnabled = () => {
  try { return game.settings.get(MODULE_ID, 'debug') === true; }
  catch { return false; }
};

const local = {
  isDebug: debugEnabled,
  log:   (...args) => console.log(PREFIX, ...args),
  warn:  (...args) => console.warn(PREFIX, ...args),
  error: (...args) => console.error(PREFIX, ...args),
  debug: (...args) => { if (debugEnabled()) console.log(PREFIX, ...args); },
  trace: (label) => {
    if (!debugEnabled()) return;
    console.groupCollapsed(`${PREFIX} ${label}`);
    console.trace('call stack');
    console.groupEnd();
  },
};

let resolved = null;

function backend() {
  if (resolved) return resolved;
  const makeLogger = libUtils()?.makeLogger;
  if (makeLogger) resolved = makeLogger(MODULE_ID);
  return resolved ?? local;
}

export const log = {
  isDebug: () => backend().isDebug(),
  log:   (...args) => backend().log(...args),
  warn:  (...args) => backend().warn(...args),
  error: (...args) => backend().error(...args),
  debug: (...args) => backend().debug(...args),
  trace: (label) => backend().trace(label),
};
