import { test } from 'node:test';
import assert from 'node:assert/strict';

import { planImageTree } from './relocate.js';

/**
 * A fake file source, so the walk can be exercised without Foundry.
 * @param {Record<string, string[]>} tree directory -> entries (a trailing "/"
 *        marks a subdirectory)
 */
function fakeIo(tree) {
  const entriesOf = (dir) => tree[dir] ?? [];
  return {
    browse: async (_src, dir) => ({
      dirs: entriesOf(dir).filter(e => e.endsWith('/')).map(e => `${dir}/${e.slice(0, -1)}`),
      files: entriesOf(dir).filter(e => !e.endsWith('/')).map(e => `${dir}/${e}`),
    }),
    browseImages: async (_src, dir) => entriesOf(dir)
      .filter(e => !e.endsWith('/'))
      .map(e => `${dir}/${e}`),
  };
}

const FROM = 'modules/scorpious187s-token-library/storage';
const TO = 'my-library';

test('nested art is copied, not just the top level', () => {
  // The bug this guards: subfolders carry trait meaning, and a one-level walk
  // silently dropped everything below `art/<category>/` — most of the library.
  const io = fakeIo({
    [`${FROM}/art`]: ['guard/'],
    [`${FROM}/art/guard`]: ['loose.webp', 'dwarf/'],
    [`${FROM}/art/guard/dwarf`]: ['male/'],
    [`${FROM}/art/guard/dwarf/male`]: ['a.webp', 'b.webp'],
  });

  return planImageTree('data', FROM, TO, `${FROM}/art`, 0, io).then((entries) => {
    assert.equal(entries.length, 3);
    assert.deepEqual(entries.map(e => e.from).sort(), [
      `${FROM}/art/guard/dwarf/male/a.webp`,
      `${FROM}/art/guard/dwarf/male/b.webp`,
      `${FROM}/art/guard/loose.webp`,
    ]);
  });
});

test('the tree arrives at the destination with its shape intact', async () => {
  const io = fakeIo({
    [`${FROM}/art`]: ['guard/'],
    [`${FROM}/art/guard`]: ['dwarf/'],
    [`${FROM}/art/guard/dwarf`]: ['male/'],
    [`${FROM}/art/guard/dwarf/male`]: ['a.webp'],
  });

  const [entry] = await planImageTree('data', FROM, TO, `${FROM}/art`, 0, io);
  // Flattening here would lose the folder-derived traits along with the layout.
  assert.equal(entry.dir, `${TO}/art/guard/dwarf/male`);
});

test('a missing directory plans nothing rather than throwing', async () => {
  const entries = await planImageTree('data', FROM, TO, `${FROM}/frames`, 0, fakeIo({}));
  assert.deepEqual(entries, []);
});

test('the walk stops at the shared depth limit', async () => {
  // Ten levels deep; the walk must bottom out rather than recurse forever.
  const tree = {};
  let dir = `${FROM}/art`;
  for (let i = 0; i < 10; i++) {
    tree[dir] = [`level${i}.webp`, `down/`];
    dir = `${dir}/down`;
  }
  tree[dir] = ['deepest.webp'];

  const entries = await planImageTree('data', FROM, TO, `${FROM}/art`, 0, fakeIo(tree));
  assert.ok(entries.length > 1, 'descends past the first level');
  assert.ok(entries.length < 11, 'does not walk the whole ten levels');
  assert.ok(!entries.some(e => e.from.endsWith('deepest.webp')));
});
