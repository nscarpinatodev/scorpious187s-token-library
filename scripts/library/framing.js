/**
 * Telling token art apart from the portrait art it was cut from, and pairing
 * the two back up.
 *
 * A generated character usually arrives as a set: a square token crop and the
 * 3:4 portrait or reference sheet it came from, sitting in the same folder.
 * Both are images, so the directory scan indexes both, and a random roll could
 * hand a 3:4 reference sheet to the canvas as a token texture.
 *
 * Framing is therefore a trait like race or gender, with one difference: the
 * pools filter on it rather than offering it. Portraits stay out of every
 * randomisation set, and instead get applied to the actor's avatar when one is
 * paired — which is the thing a portrait was always the right image for.
 *
 * Everything here is pure, so it can be tested without Foundry.
 */

import { FRAMING, FRAMING_FACET } from '../constants.js';

/**
 * Words that describe how a file is framed rather than what it depicts, and so
 * do not belong in a subject's identity.
 */
const FRAMING_MARKERS = new Set([FRAMING.PORTRAIT, FRAMING.TOKEN, 'square']);

/** An aspect-ratio suffix: `1x1`, `3x4`, `16x9`. */
const ASPECT = /^\d{1,2}x\d{1,2}$/;

/**
 * How much of a leading name every file in a folder must share before the folder
 * is treated as holding one subject. Two tokens is enough for `unique-zolra-…`
 * and far more than a category folder of unrelated art ever manages.
 */
const SUBJECT_PREFIX_MIN = 2;

/**
 * Lowercase word tokens of a filename.
 *
 * Deliberately not infer.js's tokenizer, which drops pure-numeric parts — that
 * is right for trait inference (`-01` is a sequence number, not a trait) and
 * wrong here, where `dragon-imperium-01` and `dragon-imperium-02` are different
 * people and the number is the only thing separating them.
 *
 * @param {string} filename
 * @returns {string[]}
 */
export function nameTokens(filename) {
  return String(filename ?? '')
    .replace(/\.\w+$/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/**
 * True when a filename declares itself portrait or reference art.
 * @param {string} filename
 */
export function isPortraitFilename(filename) {
  return nameTokens(filename).includes(FRAMING.PORTRAIT);
}

/**
 * Whether an image is portrait art, given its filename and its recorded traits.
 *
 * An explicit `framing` trait wins, so a GM can mark something as a portrait
 * that the filename never admitted to — or rescue a token whose name happens to
 * contain the word.
 *
 * @param {string} filename
 * @param {Record<string, string[]>} [facets]
 */
export function isPortrait(filename, facets = {}) {
  const declared = facets?.[FRAMING_FACET];
  if (Array.isArray(declared) && declared.length) return declared.includes(FRAMING.PORTRAIT);
  return isPortraitFilename(filename);
}

/**
 * The part of a filename that identifies the subject, with framing and aspect
 * markers stripped out.
 *
 * `dragon-imperium-01-human-male-token-1x1.png` and
 * `dragon-imperium-01-human-male-portrait-3x4.png` both reduce to
 * `dragon-imperium-01-human-male`, which is what makes them a pair.
 *
 * @param {string} filename
 * @returns {string}
 */
export function stemTokens(filename) {
  return nameTokens(filename)
    .filter(token => !FRAMING_MARKERS.has(token) && !ASPECT.test(token));
}

export function subjectStem(filename) {
  return stemTokens(filename).join('-');
}

/**
 * The plain numbers in a subject stem — the `01` of `dragon-imperium-01-human-male`.
 *
 * These are what separate one person from another inside a numbered set, which
 * is the difference between a folder of twenty riders and a folder of one
 * character's twenty variants. Aspect markers are already gone by this point, so
 * `1x1` cannot be mistaken for one.
 */
function enumerators(tokens) {
  return tokens.filter(token => /^\d+$/.test(token));
}

/**
 * Whether two files could depict the same subject.
 *
 * Differing numbers mean different people: rider 01 and rider 03 are not each
 * other, however much of a name they share. A number on only one side is not a
 * conflict — `zolra-bust` and `zolra-full-body-02` are still Zolra — so it only
 * counts as a mismatch when both sides are numbered and disagree.
 */
export function sameSubject(a, b) {
  const left = enumerators(a);
  const right = enumerators(b);
  if (!left.length || !right.length) return true;
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

/** How many leading tokens two token lists have in common. */
export function sharedPrefix(a, b) {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

/** How many distinct tokens two lists share, wherever they appear. */
function sharedTokens(a, b) {
  const other = new Set(b);
  return new Set(a.filter(token => other.has(token))).size;
}

/**
 * Rank one portrait against another for a given token image.
 *
 * Leading agreement decides it in almost every case. The rest only breaks ties
 * between variants of the same subject, where a shared marker anywhere in the
 * name is the real signal — it is what pairs `…-bust-1x1-02` with
 * `…-full-body-02` rather than with `…-full-body`. Length closeness and then
 * the filename settle the remainder, so a rebuild always pairs the same way.
 *
 * @returns {number} Negative when `a` is the better match.
 */
function compareCandidates(a, b, tokens) {
  return (
    sharedPrefix(tokens, b.tokens) - sharedPrefix(tokens, a.tokens)
    || sharedTokens(tokens, b.tokens) - sharedTokens(tokens, a.tokens)
    || Math.abs(a.tokens.length - tokens.length) - Math.abs(b.tokens.length - tokens.length)
    || a.image.filename.localeCompare(b.image.filename)
  );
}

/** The tokens every one of these files starts with. */
function commonPrefix(tokenLists) {
  if (!tokenLists.length) return [];
  return tokenLists.reduce((acc, tokens) => acc.slice(0, sharedPrefix(acc, tokens)));
}

/**
 * Pair the token art in one directory with its portraits.
 *
 * Two rules, the confident one first:
 *
 *   1. The subject stems match outright — the generated-set case, where a token
 *      and its portrait differ only by a framing marker
 *      (`…-01-human-male-token-1x1` and `…-01-human-male-portrait-3x4`).
 *   2. The folder holds a single subject — everything in it shares a leading
 *      name, as `uniques/zolra/` does — so any portrait in it depicts that
 *      subject, and the best-ranked one wins. `sameSubject` still applies, which
 *      is what stops a numbered set from pairing rider 03 with rider 01.
 *
 * Anything else is left unpaired on purpose. A category folder holding hundreds
 * of unrelated commoners shares no leading name, so rule 2 never fires there and
 * nobody inherits a stranger's face.
 *
 * @param {Array<{path: string, filename: string, isPortrait: boolean}>} images
 *        Every image sharing one directory.
 * @returns {Map<string, string>} token path → portrait path
 */
export function pairPortraits(images) {
  const pairs = new Map();
  const portraits = images.filter(image => image.isPortrait);
  const tokens = images.filter(image => !image.isPortrait);
  if (!portraits.length || !tokens.length) return pairs;

  const tokenised = new Map(images.map(image => [image.path, nameTokens(image.filename)]));
  const stems = new Map(images.map(image => [image.path, subjectStem(image.filename)]));
  const stemsTokens = new Map(images.map(image => [image.path, stemTokens(image.filename)]));

  const folderPrefix = commonPrefix(images.map(image => tokenised.get(image.path)));
  const singleSubject = folderPrefix.length >= SUBJECT_PREFIX_MIN;

  // Sorted so ties resolve the same way on every rebuild.
  const candidates = [...portraits]
    .sort((a, b) => a.filename.localeCompare(b.filename))
    .map(image => ({ image, tokens: tokenised.get(image.path) }));

  const unmatched = [];
  for (const token of tokens) {
    const stem = stems.get(token.path);
    const exact = candidates.find(candidate => stems.get(candidate.image.path) === stem);
    if (exact) pairs.set(token.path, exact.image.path);
    else unmatched.push(token);
  }

  if (!singleSubject) return pairs;

  // Left over in a folder that holds one subject: any portrait of that subject
  // will do. `sameSubject` is what keeps that honest inside a numbered set —
  // rider 03 finds nothing rather than inheriting rider 01's face.
  for (const token of unmatched) {
    const own = tokenised.get(token.path);
    const mine = stemsTokens.get(token.path);
    const viable = candidates.filter(c => sameSubject(mine, stemsTokens.get(c.image.path)));
    if (!viable.length) continue;
    const [best] = viable.sort((a, b) => compareCandidates(a, b, own));
    pairs.set(token.path, best.image.path);
  }

  return pairs;
}
