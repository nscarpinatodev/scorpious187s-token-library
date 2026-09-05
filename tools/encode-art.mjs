/**
 * Encode source art into the shipped library as WebP.
 *
 * The library ships WebP because a token image is fetched every time a scene
 * loads, and the PNG masters are five to ten times the size for no visible
 * gain. The masters stay in `storage/art-originals/` — gitignored, never
 * packaged — and this is what turns them into `storage/art/`.
 *
 * The directory tree is reproduced exactly, because subfolders are traits: the
 * scanner reads `art/guard/dwarf/male/` as dwarf and male. Filenames are kept
 * too, extension aside, because portrait pairing matches on them.
 *
 * Usage:
 *   node tools/encode-art.mjs <source> <destination> [options]
 *
 *   --apply            actually write (default is a dry run)
 *   --quality <1-100>  WebP quality (default 96, matched to the existing library)
 *   --force            re-encode even when the destination already exists
 *
 * Example:
 *   node tools/encode-art.mjs \
 *     storage/art-originals/dragonriders storage/art/dragonriders --apply
 *
 * Requires the optional dev dependency @napi-rs/canvas:
 *   npm install
 */

import fs from 'fs';
import path from 'path';

const SOURCE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg']);
/**
 * Calibrated, not guessed. The art already in `storage/art/` sits at about
 * 45.2 dB PSNR against its own PNG masters; q96 reproduces that to within
 * 0.15 dB, so newly encoded art matches what surrounds it rather than being
 * visibly softer. Lower values look fine in isolation and wrong next to a
 * neighbouring token.
 */
const DEFAULT_QUALITY = 96;

// ── Arguments ────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const value = (name, fallback) => {
  const i = argv.indexOf(name);
  return i === -1 ? fallback : argv[i + 1];
};

const positional = argv.filter((a, i) =>
  !a.startsWith('--') && !['--quality'].includes(argv[i - 1]));

const [source, destination] = positional;
const apply = flag('--apply');
const force = flag('--force');
const quality = Number(value('--quality', DEFAULT_QUALITY));

if (!source || !destination) {
  console.error('usage: node tools/encode-art.mjs <source> <destination> [--apply] '
    + '[--quality 96] [--force]');
  process.exit(2);
}
if (!Number.isFinite(quality) || quality < 1 || quality > 100) {
  console.error(`--quality must be 1-100, got ${value('--quality', DEFAULT_QUALITY)}`);
  process.exit(2);
}
if (!fs.existsSync(source)) {
  console.error(`source does not exist: ${source}`);
  process.exit(2);
}

let canvasModule;
try {
  canvasModule = await import('@napi-rs/canvas');
} catch {
  console.error('@napi-rs/canvas is not installed. Run `npm install` first.');
  process.exit(2);
}
const { createCanvas, loadImage } = canvasModule;

// ── Walk ─────────────────────────────────────────────────────────────────────

/** Every encodable file under `dir`, as paths relative to it. */
function sources(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(full, base));
    else if (SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.relative(base, full));
    }
  }
  return out;
}

const files = sources(source);
if (!files.length) {
  console.error(`no .png/.jpg/.jpeg found under ${source}`);
  process.exit(1);
}

// ── Encode ───────────────────────────────────────────────────────────────────

const posix = (p) => p.split(path.sep).join('/');
const kb = (n) => `${(n / 1024).toFixed(0)} KB`;
const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;

let sourceBytes = 0;
let outputBytes = 0;
let written = 0;
let skipped = 0;
let transparent = 0;
const failures = [];

for (const relative of files) {
  const from = path.join(source, relative);
  const to = path.join(destination, relative.replace(/\.\w+$/, '.webp'));

  sourceBytes += fs.statSync(from).size;

  if (!force && fs.existsSync(to)) {
    outputBytes += fs.statSync(to).size;
    skipped++;
    continue;
  }

  try {
    const image = await loadImage(from);
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0);

    // Worth knowing per run: art meant to sit inside a ring is usually cut out
    // on transparency, and WebP has to carry that alpha through.
    const { data } = ctx.getImageData(0, 0, image.width, image.height);
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 255) { transparent++; break; }
    }

    const buffer = canvas.encodeSync('webp', quality);
    outputBytes += buffer.length;

    if (apply) {
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.writeFileSync(to, buffer);
    }
    written++;

    if (written <= 3 || written % 20 === 0) {
      console.log(`  ${posix(relative)}  ${image.width}x${image.height}  `
        + `${kb(fs.statSync(from).size)} -> ${kb(buffer.length)}`);
    }
  } catch (err) {
    failures.push({ file: posix(relative), error: String(err?.message ?? err) });
  }
}

// ── Report ───────────────────────────────────────────────────────────────────

console.log();
console.log(`source      ${posix(source)}`);
console.log(`destination ${posix(destination)}`);
console.log(`quality     ${quality}`);
console.log(`encoded     ${written}${skipped ? `, ${skipped} already present` : ''}`
  + `${failures.length ? `, ${failures.length} failed` : ''}`);
console.log(`size        ${mb(sourceBytes)} -> ${mb(outputBytes)}`
  + ` (${(100 - (outputBytes / sourceBytes) * 100).toFixed(0)}% smaller)`);
console.log(`alpha       ${transparent} of ${written} carry transparency`);

if (failures.length) {
  console.log('\nfailures:');
  for (const f of failures) console.log(`  ${f.file}: ${f.error}`);
}
if (!apply) console.log('\ndry run — pass --apply to write');

process.exit(failures.length ? 1 : 0);
