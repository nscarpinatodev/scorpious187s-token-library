import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  nameTokens, isPortraitFilename, isPortrait, subjectStem, sharedPrefix, pairPortraits,
} from './framing.js';

/** Build the image records pairPortraits() expects, all in one directory. */
function folder(dir, ...filenames) {
  return filenames.map(filename => ({
    path: `${dir}/${filename}`,
    filename,
    isPortrait: isPortraitFilename(filename),
  }));
}

/** pairPortraits() keyed by filename, for readable assertions. */
function pairsByName(images) {
  const pairs = pairPortraits(images);
  const named = {};
  for (const [from, to] of pairs) {
    named[from.split('/').pop()] = to.split('/').pop();
  }
  return named;
}

// ── Tokenising ───────────────────────────────────────────────────────────────

test('sequence numbers survive tokenising, unlike trait inference', () => {
  // infer.js drops pure-numeric parts because `-01` is not a trait. Here it is
  // the only thing separating one rider from the next, so it has to stay.
  assert.deepEqual(
    nameTokens('dragon-imperium-01-human-male-token-1x1.png'),
    ['dragon', 'imperium', '01', 'human', 'male', 'token', '1x1'],
  );
});

test('tokenising handles camel case, separators and extensions', () => {
  assert.deepEqual(nameTokens('SeralyneElvenEars.webp'), ['seralyne', 'elven', 'ears']);
  assert.deepEqual(nameTokens('Seralyne 3-portrait.webp'), ['seralyne', '3', 'portrait']);
  assert.deepEqual(nameTokens(''), []);
  assert.deepEqual(nameTokens(null), []);
});

// ── Recognising portraits ────────────────────────────────────────────────────

test('a filename declares itself a portrait only as a whole word', () => {
  assert.equal(isPortraitFilename('unique-taliaoth-full-body-portrait.webp'), true);
  assert.equal(isPortraitFilename('dragon-imperium-01-human-male-portrait-3x4.png'), true);
  assert.equal(isPortraitFilename('dragon-imperium-01-human-male-token-1x1.png'), false);
  assert.equal(isPortraitFilename('guard-dwarf-male-01.webp'), false);
  // Substrings must not count, or "portraiture" would hide art from every pool.
  assert.equal(isPortraitFilename('portraiture-study-01.webp'), false);
});

test('an explicit framing trait overrides the filename in both directions', () => {
  assert.equal(isPortrait('guard-01.webp', { framing: ['portrait'] }), true);
  assert.equal(isPortrait('something-portrait.webp', { framing: ['token'] }), false);
  // An empty or absent trait falls back to the filename.
  assert.equal(isPortrait('something-portrait.webp', { framing: [] }), true);
  assert.equal(isPortrait('something-portrait.webp', {}), true);
  assert.equal(isPortrait('something-portrait.webp'), true);
});

// ── Subject identity ─────────────────────────────────────────────────────────

test('framing and aspect markers drop out of a subject stem', () => {
  const token = subjectStem('dragon-imperium-01-human-male-token-1x1.png');
  const portrait = subjectStem('dragon-imperium-01-human-male-portrait-3x4.png');
  assert.equal(token, 'dragon-imperium-01-human-male');
  assert.equal(portrait, token);
});

test('different subjects keep different stems', () => {
  assert.notEqual(
    subjectStem('dragon-imperium-01-human-male-token-1x1.png'),
    subjectStem('dragon-imperium-02-human-female-token-1x1.png'),
  );
});

test('sharedPrefix counts only leading agreement', () => {
  assert.equal(sharedPrefix(['a', 'b', 'c'], ['a', 'b', 'z']), 2);
  assert.equal(sharedPrefix(['a'], []), 0);
  assert.equal(sharedPrefix(['x', 'b'], ['a', 'b']), 0);
});

// ── Pairing ──────────────────────────────────────────────────────────────────

test('a generated set pairs on its subject stem', () => {
  const images = folder('art/dragonriders/dragon-imperium',
    'dragon-imperium-01-human-male-token-1x1.png',
    'dragon-imperium-01-human-male-portrait-3x4.png',
    'dragon-imperium-02-human-female-token-1x1.png',
    'dragon-imperium-02-human-female-portrait-3x4.png');

  assert.deepEqual(pairsByName(images), {
    'dragon-imperium-01-human-male-token-1x1.png': 'dragon-imperium-01-human-male-portrait-3x4.png',
    'dragon-imperium-02-human-female-token-1x1.png': 'dragon-imperium-02-human-female-portrait-3x4.png',
  });
});

test('a token whose portrait is missing pairs with nobody else in the set', () => {
  // The regression that matters: rider 03 must not inherit rider 01's face.
  const images = folder('art/dragonriders/dragon-imperium',
    'dragon-imperium-01-human-male-token-1x1.png',
    'dragon-imperium-01-human-male-portrait-3x4.png',
    'dragon-imperium-03-human-male-token-1x1.png');

  const pairs = pairsByName(images);
  assert.equal(pairs['dragon-imperium-03-human-male-token-1x1.png'], undefined);
  assert.equal(Object.keys(pairs).length, 1);
});

test('one portrait in a single-subject folder serves every token in it', () => {
  const images = folder('art/uniques/torvat-hivyatha',
    'unique-torvat-hivyatha-fantasy-square.webp',
    'unique-torvat-hivyatha-hologram.webp',
    'unique-torvat-hivyatha-modern.webp',
    'unique-torvat-hivyatha-fantasy-portrait.webp');

  const pairs = pairsByName(images);
  assert.equal(Object.keys(pairs).length, 3);
  for (const portrait of Object.values(pairs)) {
    assert.equal(portrait, 'unique-torvat-hivyatha-fantasy-portrait.webp');
  }
});

test('several portraits of one subject pair by the variant they share', () => {
  const images = folder('art/uniques/angela-alagondar',
    'unique-angela-alagondar-realistic-bust-1x1.webp',
    'unique-angela-alagondar-realistic-bust-1x1-02.webp',
    'unique-angela-alagondar-realistic-full-body-portrait.webp',
    'unique-angela-alagondar-realistic-full-body-02-portrait.webp');

  assert.deepEqual(pairsByName(images), {
    'unique-angela-alagondar-realistic-bust-1x1.webp':
      'unique-angela-alagondar-realistic-full-body-portrait.webp',
    'unique-angela-alagondar-realistic-bust-1x1-02.webp':
      'unique-angela-alagondar-realistic-full-body-02-portrait.webp',
  });
});

test('a mixed category folder never pairs unrelated art', () => {
  // Hundreds of unrelated commoners share no leading name, so nobody should
  // inherit a stranger's portrait just for sitting in the same directory.
  const images = folder('art/commoner',
    'openart-021778528515885fef-portrait.webp',
    'openart-99887766554433221100.webp',
    'Seralyne Elven Ears.webp');

  assert.deepEqual(pairsByName(images), {});
});

test('pairing is stable and side-effect free', () => {
  const images = folder('art/uniques/zolra',
    'unique-zolra-storm-sorceress-bust-1x1.webp',
    'unique-zolra-storm-sorceress-full-body-portrait.webp',
    'unique-zolra-reference-original-portrait.webp');

  const first = pairsByName(images);
  const second = pairsByName([...images].reverse());
  assert.deepEqual(first, second);
  assert.equal(
    first['unique-zolra-storm-sorceress-bust-1x1.webp'],
    'unique-zolra-storm-sorceress-full-body-portrait.webp',
  );
});

test('a folder of only portraits, or only tokens, pairs nothing', () => {
  assert.deepEqual(pairsByName(folder('art/x', 'a-portrait.webp', 'b-portrait.webp')), {});
  assert.deepEqual(pairsByName(folder('art/x', 'a.webp', 'b.webp')), {});
  assert.deepEqual(pairsByName([]), {});
});
