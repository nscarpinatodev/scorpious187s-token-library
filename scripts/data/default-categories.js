/**
 * A starting category list for D&D 5e and Pathfinder 2e games.
 *
 * Categories are **roles**, not species — "Guard", "Bandit", "Acolyte". Species
 * and gender belong in traits, because one pool of guard art usually needs to
 * serve elves and dwarves alike, and splitting the pool by species would mean
 * re-cutting it every time a new one turns up.
 *
 * `names` are matched against an actor's name by whole-word containment, which
 * is why "Bandit Captain" finds the bandit category. Keep them lowercase and
 * distinctive: a name as generic as "guard" would otherwise swallow
 * "Guardian", so the matcher's word-boundary rule does the work rather than
 * substring soup.
 *
 * `creatureTypes` are a last resort, consulted only when no name matches.
 */

/** @typedef {{id: string, label: string, names: string[], creatureTypes?: string[]}} DefaultCategory */

/** @type {DefaultCategory[]} */
export const DEFAULT_CATEGORIES = [
  // ── Townsfolk ──────────────────────────────────────────────────────────────
  { id: 'commoner',   label: 'Commoner',    names: ['commoner', 'peasant', 'villager', 'citizen', 'townsfolk'], creatureTypes: ['humanoid'] },
  { id: 'noble',      label: 'Noble',       names: ['noble', 'aristocrat', 'lord', 'lady', 'baron', 'baroness', 'courtier'] },
  { id: 'merchant',   label: 'Merchant',    names: ['merchant', 'trader', 'shopkeeper', 'vendor', 'peddler'] },
  { id: 'innkeeper',  label: 'Innkeeper',   names: ['innkeeper', 'barkeep', 'bartender', 'tavernkeeper', 'publican'] },
  { id: 'farmer',     label: 'Farmer',      names: ['farmer', 'farmhand', 'shepherd', 'herder'] },
  { id: 'labourer',   label: 'Labourer',    names: ['labourer', 'laborer', 'miner', 'dockworker', 'porter', 'stevedore'] },
  { id: 'artisan',    label: 'Artisan',     names: ['artisan', 'craftsman', 'blacksmith', 'smith', 'carpenter', 'mason', 'tailor', 'cobbler'] },
  { id: 'servant',    label: 'Servant',     names: ['servant', 'maid', 'butler', 'valet', 'steward', 'attendant'] },
  { id: 'beggar',     label: 'Beggar',      names: ['beggar', 'vagrant', 'urchin', 'street urchin'] },
  { id: 'child',      label: 'Child',       names: ['child', 'kid', 'youth', 'boy', 'girl'] },
  { id: 'sailor',     label: 'Sailor',      names: ['sailor', 'deckhand', 'mariner', 'fisherman', 'fisher'] },
  { id: 'entertainer', label: 'Entertainer', names: ['entertainer', 'minstrel', 'performer', 'jester', 'dancer', 'acrobat'] },

  // ── Law and war ────────────────────────────────────────────────────────────
  { id: 'guard',      label: 'Guard',       names: ['guard', 'watchman', 'sentry', 'gate guard', 'city watch'] },
  { id: 'soldier',    label: 'Soldier',     names: ['soldier', 'warrior', 'infantry', 'legionnaire', 'man-at-arms'] },
  { id: 'veteran',    label: 'Veteran',     names: ['veteran', 'champion', 'gladiator'] },
  { id: 'knight',     label: 'Knight',      names: ['knight', 'cavalier', 'paladin', 'crusader'] },
  { id: 'captain',    label: 'Captain',     names: ['captain', 'commander', 'sergeant', 'lieutenant', 'warlord'] },
  { id: 'archer',     label: 'Archer',      names: ['archer', 'bowman', 'crossbowman', 'marksman', 'sniper'] },
  { id: 'scout',      label: 'Scout',       names: ['scout', 'ranger', 'tracker', 'outrider', 'pathfinder'] },
  { id: 'mercenary',  label: 'Mercenary',   names: ['mercenary', 'sellsword', 'hireling', 'freebooter'] },
  { id: 'berserker',  label: 'Berserker',   names: ['berserker', 'barbarian', 'raider', 'reaver'] },

  // ── Criminals ──────────────────────────────────────────────────────────────
  { id: 'bandit',     label: 'Bandit',      names: ['bandit', 'brigand', 'highwayman', 'outlaw', 'marauder'] },
  { id: 'thug',       label: 'Thug',        names: ['thug', 'ruffian', 'enforcer', 'bruiser', 'tough'] },
  { id: 'thief',      label: 'Thief',       names: ['thief', 'rogue', 'burglar', 'cutpurse', 'pickpocket'] },
  { id: 'assassin',   label: 'Assassin',    names: ['assassin', 'killer', 'murderer'] },
  { id: 'spy',        label: 'Spy',         names: ['spy', 'informant', 'infiltrator', 'agent'] },
  { id: 'pirate',     label: 'Pirate',      names: ['pirate', 'buccaneer', 'corsair', 'privateer'] },
  { id: 'smuggler',   label: 'Smuggler',    names: ['smuggler', 'fence', 'bootlegger'] },

  // ── Faith and magic ────────────────────────────────────────────────────────
  { id: 'acolyte',    label: 'Acolyte',     names: ['acolyte', 'initiate', 'novice', 'adept'] },
  { id: 'priest',     label: 'Priest',      names: ['priest', 'priestess', 'cleric', 'bishop', 'hierophant', 'oracle'] },
  { id: 'monk',       label: 'Monk',        names: ['monk', 'ascetic', 'friar'] },
  { id: 'druid',      label: 'Druid',       names: ['druid', 'shaman', 'witch doctor'] },
  { id: 'mage',       label: 'Mage',        names: ['mage', 'wizard', 'sorcerer', 'sorceress', 'archmage', 'magus', 'evoker', 'illusionist', 'conjurer', 'transmuter', 'diviner', 'enchanter', 'abjurer', 'necromancer'] },
  { id: 'apprentice', label: 'Apprentice',  names: ['apprentice', 'student', 'scribe'] },
  { id: 'warlock',    label: 'Warlock',     names: ['warlock', 'witch', 'hexer'] },
  { id: 'bard',       label: 'Bard',        names: ['bard', 'skald', 'troubadour'] },
  { id: 'cultist',    label: 'Cultist',     names: ['cultist', 'fanatic', 'zealot', 'devotee'] },
  { id: 'alchemist',  label: 'Alchemist',   names: ['alchemist', 'apothecary', 'herbalist', 'chirurgeon'] },
  { id: 'scholar',    label: 'Scholar',     names: ['scholar', 'sage', 'librarian', 'archivist', 'loremaster'] },

  // ── Humanoid folk ──────────────────────────────────────────────────────────
  { id: 'goblin',     label: 'Goblin',      names: ['goblin'] },
  { id: 'hobgoblin',  label: 'Hobgoblin',   names: ['hobgoblin'] },
  { id: 'bugbear',    label: 'Bugbear',     names: ['bugbear'] },
  { id: 'kobold',     label: 'Kobold',      names: ['kobold'] },
  { id: 'orc',        label: 'Orc',         names: ['orc', 'ork'] },
  { id: 'gnoll',      label: 'Gnoll',       names: ['gnoll'] },
  { id: 'lizardfolk', label: 'Lizardfolk',  names: ['lizardfolk', 'lizardman', 'iruxi'] },
  { id: 'drow',       label: 'Drow',        names: ['drow', 'dark elf'] },
  { id: 'duergar',    label: 'Duergar',     names: ['duergar', 'grey dwarf', 'gray dwarf'] },
  { id: 'ogre',       label: 'Ogre',        names: ['ogre'] },
  { id: 'troll',      label: 'Troll',       names: ['troll'] },
  { id: 'giant',      label: 'Giant',       names: ['giant', 'ettin', 'cyclops'], creatureTypes: ['giant'] },
  { id: 'hag',        label: 'Hag',         names: ['hag', 'crone'] },
  { id: 'satyr',      label: 'Satyr',       names: ['satyr', 'faun'] },
  { id: 'centaur',    label: 'Centaur',     names: ['centaur'] },
  { id: 'minotaur',   label: 'Minotaur',    names: ['minotaur'] },
  { id: 'harpy',      label: 'Harpy',       names: ['harpy'] },

  // ── Undead ─────────────────────────────────────────────────────────────────
  { id: 'skeleton',   label: 'Skeleton',    names: ['skeleton'], creatureTypes: ['undead'] },
  { id: 'zombie',     label: 'Zombie',      names: ['zombie'] },
  { id: 'ghoul',      label: 'Ghoul',       names: ['ghoul', 'ghast'] },
  { id: 'ghost',      label: 'Ghost',       names: ['ghost', 'spectre', 'specter', 'wraith', 'shade', 'phantom'] },
  { id: 'vampire',    label: 'Vampire',     names: ['vampire', 'vampire spawn', 'dhampir'] },
  { id: 'mummy',      label: 'Mummy',       names: ['mummy'] },
  { id: 'lich',       label: 'Lich',        names: ['lich'] },

  // ── Outsiders ──────────────────────────────────────────────────────────────
  { id: 'demon',      label: 'Demon',       names: ['demon', 'fiend', 'balor', 'succubus', 'incubus'], creatureTypes: ['fiend'] },
  { id: 'devil',      label: 'Devil',       names: ['devil', 'imp', 'erinyes', 'pit fiend'] },
  { id: 'angel',      label: 'Angel',       names: ['angel', 'deva', 'planetar', 'solar', 'archon'] },
  { id: 'elemental',  label: 'Elemental',   names: ['elemental', 'genie', 'djinni', 'efreeti'], creatureTypes: ['elemental'] },
  { id: 'fey',        label: 'Fey',         names: ['fey', 'sprite', 'pixie', 'dryad', 'nymph'], creatureTypes: ['fey'] },
  { id: 'lycanthrope', label: 'Lycanthrope', names: ['werewolf', 'wererat', 'werebear', 'weretiger', 'wereboar', 'lycanthrope'] },
];

/** Suggested traits to go with the categories above. */
export const DEFAULT_FACETS = [
  {
    id: 'race',
    label: 'Race',
    values: [
      'human', 'elf', 'half-elf', 'dwarf', 'halfling', 'gnome', 'half-orc', 'orc',
      'tiefling', 'dragonborn', 'goblin', 'kobold', 'lizardfolk', 'catfolk',
      'aasimar', 'genasi', 'goliath', 'firbolg', 'tabaxi', 'kenku', 'leshy',
    ],
  },
  { id: 'gender', label: 'Gender', values: ['male', 'female'] },
  {
    id: 'age',
    label: 'Age',
    values: ['child', 'young', 'adult', 'mature', 'middle-aged', 'elderly', 'elder', 'veteran'],
  },
  { id: 'build', label: 'Build', values: ['slight', 'average', 'stocky', 'muscular', 'heavy'] },
  { id: 'environment', label: 'Environment', values: ['urban', 'rural', 'wilderness', 'coastal', 'underground', 'desert', 'arctic'] },
  { id: 'armour', label: 'Armour', values: ['unarmoured', 'light', 'medium', 'heavy', 'robes'] },
  {
    id: 'mood',
    label: 'Mood',
    // The base five plus the expressions the shipped art actually names.
    values: [
      'friendly', 'neutral', 'hostile', 'wary', 'wounded',
      'stern', 'skeptical', 'amused', 'joyful', 'grieving', 'defiant',
      'serene', 'suspicious', 'terrified', 'delighted', 'alert', 'patient',
      'curious', 'startled', 'mischievous', 'anxious', 'nervous', 'disciplined',
      'sly', 'weary', 'powerful', 'calculating', 'severe', 'contemptuous',
      'sorrowful', 'hopeful', 'jovial', 'cheerful', 'fierce', 'cocky',
      'reckless', 'watchful', 'unimpressed', 'genial', 'bashful', 'proud',
      'earnest', 'controlled', 'grim', 'audacious', 'intense', 'determined',
      'boisterous', 'stoic', 'focused', 'embarrassed', 'angry',
    ],
  },
  // What a figure does, as opposed to what it is. The category already says
  // "bandit"; this says which kind, so one pool can serve an ambush of five
  // archers and a brawl of five bruisers. Most values match no shipped art yet
  // and are here as vocabulary for tagging -- unused values never reach the
  // filter chips, which only offer what a category actually holds.
  {
    id: 'archetype',
    label: 'Archetype',
    values: [
      'archer', 'bruiser', 'raider', 'rogue', 'scout', 'skirmisher',
      'warrior', 'brute', 'duelist', 'berserker', 'sentry', 'hunter',
      'tracker', 'spy', 'assassin', 'leader', 'recruit', 'mage',
      'sorcerer', 'warlock', 'priest', 'druid', 'bard', 'monk',
      'healer', 'alchemist',
    ],
  },
  // Framing is inferred from the filename and rarely set by hand, but it lives
  // here so a GM can mark art the name never declared — or rescue a token whose
  // name happens to contain "portrait".
  { id: 'framing', label: 'Framing', values: ['token', 'portrait'] },
];
