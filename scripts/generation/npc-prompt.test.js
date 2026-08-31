import assert from 'node:assert/strict';
import test from 'node:test';

import { buildNpcFilename, generateNpcPrompt, PROMPT_CATEGORIES } from './npc-prompt.js';
import { inferFacets } from '../library/infer.js';
import { DEFAULT_CATEGORIES, DEFAULT_FACETS } from '../data/default-categories.js';

test('contains prompt data for every default category', () => {
  assert.deepEqual(
    Object.keys(PROMPT_CATEGORIES).sort(),
    DEFAULT_CATEGORIES.map(category => category.id).sort(),
  );
});

test('the same seed creates the same generation job', () => {
  const first = generateNpcPrompt({ category: 'guard', seed: 'stable', sequence: 7 });
  const second = generateNpcPrompt({ category: 'guard', seed: 'stable', sequence: 7 });
  assert.deepEqual(first, second);
});

test('trait overrides reach the prompt and filename', () => {
  const result = generateNpcPrompt({
    category: 'guard',
    seed: 12,
    sequence: 3,
    traits: {
      race: 'half-orc',
      gender: 'female',
      age: 'middle-aged',
      build: 'stocky',
      mood: 'wary',
    },
  });
  assert.equal(result.filename, 'guard-half-orc-female-middle-aged-wary-03.png');
  assert.match(result.prompt, /middle-aged, stocky half-orc female guard/);
  assert.match(result.prompt, /wary expression/);
});

test('generated filenames round-trip through facet inference', () => {
  const result = generateNpcPrompt({ category: 'merchant', seed: 'round-trip', sequence: 2 });
  const inferred = inferFacets(result.filename, DEFAULT_FACETS);
  for (const name of ['race', 'gender', 'age', 'mood']) {
    assert.deepEqual(inferred[name], [result.npc.traits[name]]);
  }
});

test('species categories do not get a separate race', () => {
  const result = generateNpcPrompt({
    category: 'goblin',
    seed: 42,
    traits: { race: 'elf', gender: 'male' },
  });
  assert.equal(result.npc.traits.race, undefined);
  assert.equal(result.npc.traits.gender, 'male');
  assert.doesNotMatch(result.filename, /elf/);
  assert.match(result.prompt, /goblin/);
});

test('child is opt-in except for the child category', () => {
  for (let seed = 0; seed < 100; seed += 1) {
    assert.notEqual(generateNpcPrompt({ category: 'guard', seed }).npc.traits.age, 'child');
    assert.notEqual(generateNpcPrompt({ category: 'zombie', seed }).npc.traits.age, 'child');
  }
  assert.equal(generateNpcPrompt({ category: 'child', seed: 1 }).npc.traits.age, 'child');
  assert.equal(
    generateNpcPrompt({ category: 'guard', seed: 1, traits: { age: 'child' } }).npc.traits.age,
    'child',
  );
});

test('optional visual traits are included when supplied', () => {
  const result = generateNpcPrompt({
    category: 'scout',
    seed: 10,
    traits: { armour: 'light', environment: 'wilderness' },
  });
  assert.match(result.prompt, /armour: light/);
  assert.match(result.prompt, /environmental influence: wilderness/);
});

test('invalid categories and traits fail clearly', () => {
  assert.throws(() => generateNpcPrompt({ category: 'accountant' }), /Unknown NPC category/);
  assert.throws(
    () => generateNpcPrompt({ category: 'guard', traits: { race: 'martian' } }),
    /Invalid race/,
  );
});

test('sequence numbers are always separate and padded', () => {
  const { npc } = generateNpcPrompt({ category: 'mage', seed: 1 });
  assert.match(buildNpcFilename(npc, 1), /-01\.png$/);
  assert.match(buildNpcFilename(npc, 123), /-123\.png$/);
});
