import { DEFAULT_FACETS } from '../data/default-categories.js';
import { PROMPT_CATEGORIES } from '../data/prompt-categories.js';
import { slugify } from '../storage/paths.js';

const FACET_VALUES = Object.fromEntries(DEFAULT_FACETS.map(facet => [facet.id, facet.values]));

const APPEARANCE = {
  face: ['angular face', 'broad face', 'round face', 'long narrow face', 'square jaw', 'high cheekbones'],
  complexion: ['fair complexion', 'warm brown complexion', 'deep brown complexion', 'olive complexion', 'ruddy complexion', 'freckled complexion'],
  hair: ['cropped black hair', 'wavy brown hair', 'long silver hair', 'auburn braids', 'shaved head', 'untidy blond hair'],
  feature: ['scar through one eyebrow', 'slightly crooked nose', 'small facial tattoo', 'one clouded eye', 'missing ear tip', 'distinctive birthmark'],
};

const DEFAULT_RANDOM_FACETS = ['race', 'gender', 'age', 'build', 'mood'];
const SPECIES_RANDOM_FACETS = ['age', 'build', 'mood'];
const RANDOM_AGES = FACET_VALUES.age.filter(age => age !== 'child');

/**
 * Small deterministic PRNG. A string seed produces the same NPC on every run.
 * @param {string|number} seed
 */
function randomSource(seed) {
  const value = String(seed ?? `${Date.now()}-${Math.random()}`);
  let state = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    state ^= value.charCodeAt(i);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function choose(values, random) {
  return values[Math.floor(random() * values.length)];
}

function validateCategory(category) {
  const id = slugify(category);
  if (!PROMPT_CATEGORIES[id]) {
    throw new RangeError(`Unknown NPC category "${category}".`);
  }
  return id;
}

function validateTrait(name, value) {
  if (value == null) return;
  if (!FACET_VALUES[name]?.includes(value)) {
    throw new RangeError(`Invalid ${name} "${value}". Expected one of: ${FACET_VALUES[name]?.join(', ')}.`);
  }
}

function articleFor(text) {
  return /^[aeiou]/i.test(text) ? 'an' : 'a';
}

/**
 * Create structured NPC data before rendering it as a prompt.
 *
 * @param {object} options
 * @param {string} options.category A key from PROMPT_CATEGORIES.
 * @param {string|number} [options.seed] Stable seed for reproducible output.
 * @param {Record<string, string>} [options.traits] Trait overrides.
 * @param {Partial<Record<'face'|'complexion'|'hair'|'feature', string>>} [options.appearance]
 * @returns {{category: string, traits: Record<string, string>, appearance: Record<string, string>}}
 */
export function createNpc(options = {}) {
  const category = validateCategory(options.category);
  const categoryData = PROMPT_CATEGORIES[category];
  const random = randomSource(options.seed);
  const traitNames = categoryData.species ? SPECIES_RANDOM_FACETS : DEFAULT_RANDOM_FACETS;
  const traits = {};

  for (const name of traitNames) {
    const supplied = options.traits?.[name];
    validateTrait(name, supplied);
    const values = name === 'age' ? RANDOM_AGES : FACET_VALUES[name];
    traits[name] = supplied ?? choose(values, random);
  }

  if (category === 'child' && options.traits?.age == null) traits.age = 'child';

  for (const [name, value] of Object.entries(options.traits ?? {})) {
    if (!(name in FACET_VALUES)) throw new RangeError(`Unknown NPC trait "${name}".`);
    validateTrait(name, value);
    if (name === 'race' && categoryData.species) continue;
    traits[name] = value;
  }

  const appearance = Object.fromEntries(
    Object.entries(APPEARANCE).map(([name, values]) => [
      name,
      options.appearance?.[name] ?? choose(values, random),
    ]),
  );

  return { category, traits, appearance };
}

/**
 * Produce a filename whose words can be inferred by the library's facet parser.
 * @param {ReturnType<typeof createNpc>} npc
 * @param {number} [sequence=1]
 * @param {string} [extension='png']
 */
export function buildNpcFilename(npc, sequence = 1, extension = 'png') {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError('Sequence must be a positive integer.');
  }
  const tags = ['race', 'gender', 'age', 'mood']
    .map(name => npc.traits[name])
    .filter(Boolean)
    .map(slugify);
  const suffix = String(sequence).padStart(2, '0');
  return `${npc.category}-${tags.join('-')}-${suffix}.${slugify(extension) || 'png'}`;
}

/**
 * Render a self-contained image prompt. It intentionally does not rely on chat
 * history, making each generation request safe to execute independently.
 * @param {ReturnType<typeof createNpc>} npc
 */
export function buildNpcPrompt(npc) {
  const categoryData = PROMPT_CATEGORIES[npc.category];
  const { traits, appearance } = npc;
  const identity = categoryData.species
    ? `${traits.age}, ${traits.build} ${traits.gender ? `${traits.gender} ` : ''}${categoryData.description}`
    : `${traits.age}, ${traits.build} ${traits.race} ${traits.gender} ${npc.category}, ${categoryData.description}`;
  const subject = `${articleFor(identity)} ${identity}`;
  const safetyTone = categoryData.wholesome
    ? 'Keep the depiction wholesome and suitable for a storybook.'
    : categoryData.grim
      ? 'The tone may be grim, but must not be gory.'
      : '';
  const optionalDetails = [
    traits.armour && `armour: ${traits.armour}`,
    traits.environment && `environmental influence: ${traits.environment}`,
  ].filter(Boolean);

  return [
    'Use case: stylized-concept',
    'Asset type: virtual tabletop NPC token portrait',
    `Primary request: Create a polished painterly fantasy illustration of ${subject}.`,
    `Subject details: ${appearance.face}, ${appearance.complexion}, ${appearance.hair}, ${appearance.feature}, with a ${traits.mood} expression${optionalDetails.length ? `; ${optionalDetails.join('; ')}` : ''}.`,
    'Composition/framing: square 1:1 image; bust framing from head and shoulders to mid-chest; the head fills roughly the upper third; subject centred, facing the viewer or slightly turned; nothing important in the outer sixth of the frame.',
    'Lighting/mood: even, neutral frontal lighting; plain softly blurred background in a muted colour.',
    `Constraints: maintain a consistent painterly fantasy illustration style. ${safetyTone}`.trim(),
    'Avoid: full body, anything below the chest, scenery, prominent props, furniture, horizon lines, dramatic rim light, lens flare, god rays, text, watermarks, logos, signatures, borders, frames, and circular vignettes.',
  ].join('\n');
}

/**
 * Convenience entry point for consumers that want the complete generation job.
 */
export function generateNpcPrompt(options = {}) {
  const npc = createNpc(options);
  return {
    npc,
    filename: buildNpcFilename(npc, options.sequence, options.extension),
    prompt: buildNpcPrompt(npc),
  };
}

export { PROMPT_CATEGORIES };
