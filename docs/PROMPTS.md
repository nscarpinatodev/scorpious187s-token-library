# Generating token art with ChatGPT

A working recipe for producing library art in batches, plus prompt fragments for
every category in the starter set.

---

## What the module needs from an image

The library clips artwork to a circle covering **two thirds** of the token,
because that is the subject size Foundry's dynamic rings are built around. Two
consequences shape every prompt here:

1. **Square, and framed as a bust.** Head and shoulders, or head to mid-chest.
   A full-body standing figure loses everything below the chest, and its head
   ends up tiny inside the ring.
2. **The subject centred, with air around it.** Nothing important within the
   outer sixth of the frame — that band is cropped away.

If you already have full-body art, set **Subject Framing** to *Fill, keep the
top*. It fills the square from the top edge, which lands the crop on the face
instead of the midriff. Generating fresh art is better: frame it as a bust and
leave the setting alone.

Backgrounds do not need to be transparent. The circle crop discards the corners
anyway, so a plain, softly-lit backdrop is fine and generates more reliably than
asking for transparency.

---

## The base prompt

Paste this once at the top of a ChatGPT conversation, then send only the short
variant lines that follow it.

> You are generating character tokens for a virtual tabletop.
>
> For every image I request, follow these rules exactly:
> - Square 1:1 image, 1024×1024.
> - Bust framing: head and shoulders to mid-chest. The head fills roughly the
>   upper third. Never full-body.
> - Subject centred and facing the viewer or slightly turned. Nothing important
>   in the outer sixth of the frame.
> - Even, neutral lighting from the front. No dramatic rim light or lens flare.
> - Plain, softly blurred background in a muted colour. No scenery, props,
>   furniture, or horizon lines.
> - Painterly fantasy illustration, consistent across every image in this
>   conversation.
> - No text, watermarks, logos, borders, frames, or circular vignettes.
>
> Confirm you understand, then wait for my requests.

**Why the "no borders or circular vignettes" line matters:** the module draws
the ring itself. Art that already has a painted circular frame ends up with two
rings.

---

## Working in batches

ChatGPT generates one image per request, so consistency across a category comes
from the conversation, not from a single prompt.

1. Start a fresh conversation per category, and send the base prompt.
2. Generate the first image and iterate until the style is right.
3. Then say: *"Keep this exact art style, lighting, and framing for everything
   that follows."*
4. Send variant lines one at a time — `Human male, middle-aged, leather apron,
   soot-stained` — and download as you go.
5. Start a new conversation when you switch category, so style drift does not
   creep across.

Attaching an approved image as a style reference in a new conversation works
better than describing the style again.

---

## Sorting output so it tags itself

The library reads folders as traits. Sort as you download and you never touch
the tagging UI:

```
storage/art/blacksmith/dwarf/male/01.png       → race: dwarf, gender: male
storage/art/blacksmith/human/female/02.png     → race: human, gender: female
storage/art/guard/elf/female/elderly/03.png    → race: elf, gender: female, age: elderly
```

Folder names are matched against known trait values, so nesting order does not
matter and folders that match nothing (`batch-2`, `raw`) are ignored as plain
organisation. Any value from the starter traits works as a folder name:

| Trait | Values |
|---|---|
| race | human, elf, half-elf, dwarf, halfling, gnome, half-orc, orc, tiefling, dragonborn, goblin, kobold, lizardfolk, catfolk, aasimar, genasi, goliath, firbolg, tabaxi, kenku, leshy |
| gender | male, female, androgynous |
| age | child, young, adult, middle-aged, elderly |
| build | slight, average, stocky, muscular, heavy |
| environment | urban, rural, wilderness, coastal, underground, desert, arctic |
| armour | unarmoured, light, medium, heavy, robes |
| mood | friendly, neutral, hostile, wary, wounded |

Hit **Refresh** in the browser sidebar after dropping files in.

---

## Category prompt fragments

Append one of these to `A {race} {gender}, {age}, ` and send it as a variant
line. They are written to describe *the person*, not the scene, since the base
prompt already handles framing and background.

### Townsfolk

| Category | Fragment |
|---|---|
| Commoner | plain roughspun tunic, weathered face, tired but kind expression |
| Noble | fine brocade and jewellery, immaculate hair, haughty and composed |
| Merchant | good but practical clothing, coin purse, shrewd appraising look |
| Innkeeper | apron over a linen shirt, sleeves rolled, ruddy welcoming face |
| Farmer | sun-bleached homespun, straw hat, deeply tanned and lined face |
| Labourer | sweat-stained undershirt, thick shoulders, grimy hands and forearms |
| Artisan | leather apron, tool belt, forearms scarred from the trade |
| Servant | neat dark livery, hair severely tied back, carefully neutral expression |
| Beggar | filthy layered rags, hollow cheeks, matted hair, wary eyes |
| Child | oversized hand-me-downs, unruly hair, bright curious expression |
| Sailor | salt-crusted canvas, knitted cap, windburnt skin, rope-callused hands |
| Entertainer | garish patched motley, face paint, theatrical grin |

### Law and war

| Category | Fragment |
|---|---|
| Guard | mail shirt under a city tabard, open helm, bored watchful expression |
| Soldier | dented breastplate over a gambeson, chin strap, disciplined stare |
| Veteran | battered plate, greying hair, old facial scar, weary hard eyes |
| Knight | polished plate with a heraldic surcoat, noble bearing, resolute |
| Captain | fine armour with a rank sash and plume, commanding confident glare |
| Archer | studded leather, bracer, hood down, narrow focused eyes |
| Scout | mottled green cloak with hood up, face weathered, alert and quiet |
| Mercenary | mismatched scavenged armour, stubble, cynical amused smirk |
| Berserker | furs and bare painted chest, wild braided hair, snarling |

### Criminals

| Category | Fragment |
|---|---|
| Bandit | ragged leathers, cloth mask pulled down, cocky dangerous grin |
| Thug | stained shirt, broken nose, heavy brow, flat hostile stare |
| Thief | dark fitted hood, sharp features, quick sly sideways glance |
| Assassin | black high-collared garb, cold empty expression, half in shadow |
| Spy | unremarkable respectable clothes, forgettable face, faint knowing smile |
| Pirate | open coat and sash, tricorn or bandana, gold earring, roguish laugh |
| Smuggler | heavy travelling coat with many pockets, guarded evasive eyes |

### Faith and magic

| Category | Fragment |
|---|---|
| Acolyte | simple undyed robes, holy symbol, young earnest devout face |
| Priest | rich vestments and stole, ornate holy symbol, serene authority |
| Monk | plain wrapped robes, shaved head, calm centred expression |
| Druid | living vines and rough hide, leaves in tangled hair, feral calm |
| Mage | embroidered arcane robes, high collar, piercing intelligent stare |
| Apprentice | ill-fitting robes, ink-stained fingers, nervous eager expression |
| Warlock | dark asymmetric robes, faintly glowing eyes, unsettling calm |
| Bard | colourful fitted doublet, artful hair, charming performer's smile |
| Cultist | hooded sackcloth robe, painted sigil on the brow, fervent glazed eyes |
| Alchemist | stained smock, goggles pushed up, singed eyebrows, distracted |
| Scholar | scholar's robe and spectacles, ink-stained cuffs, thoughtful frown |

### Humanoid folk

Send these without the `{race}` prefix — the species *is* the category.

| Category | Fragment |
|---|---|
| Goblin | small hunched goblin, green mottled skin, huge ears, jagged teeth, manic grin |
| Hobgoblin | disciplined hobgoblin, orange-red skin, martial topknot, cold authority |
| Bugbear | hulking bugbear, coarse fur, flat snout, small cruel eyes |
| Kobold | small kobold, red scaled snout, tiny horns, nervous darting eyes |
| Orc | broad orc, grey-green skin, jutting tusks, heavy brow, aggressive |
| Gnoll | hyena-headed gnoll, matted fur, lolling tongue, wild manic eyes |
| Lizardfolk | reptilian lizardfolk, ridged scales, slit pupils, cold unblinking |
| Drow | dark elf, obsidian skin, white hair, red eyes, disdainful |
| Duergar | grey dwarf, ashen skin, bald with a long beard, sullen and bitter |
| Ogre | enormous ogre, lumpy pallid skin, tiny eyes, slack dull expression |
| Troll | gangly troll, rubbery green hide, long nose, wet black eyes |
| Giant | colossal giant, craggy weathered features, slow contemptuous gaze |
| Hag | ancient hag, warty hooked nose, wild hair, gleeful malice |
| Satyr | satyr with curling horns, goatish beard, mischievous laugh |
| Centaur | centaur upper body, braided hair, feathers and beads, proud |
| Minotaur | bull-headed minotaur, brass ring in the nose, broad horns, glowering |
| Harpy | harpy, feathered shoulders, talon hands, wild hair, shrieking |

### Undead

Ask for these to be "grim but not gory" if the results come back too graphic.

| Category | Fragment |
|---|---|
| Skeleton | animated skeleton, bare yellowed skull, faint eye lights, tattered hood |
| Zombie | shambling zombie, grey rotting skin, slack jaw, clouded eyes |
| Ghoul | gaunt ghoul, stretched grey skin, needle teeth, ravenous stare |
| Ghost | translucent spectre, faintly glowing, hollow sorrowful face |
| Vampire | pale aristocratic vampire, red eyes, sharp fangs, predatory calm |
| Mummy | bandaged mummy, dry cracked wrappings, dark empty sockets |
| Lich | skeletal lich in ornate robes, burning eye sockets, cold intelligence |

### Outsiders

| Category | Fragment |
|---|---|
| Demon | chaotic demon, crimson skin, twisted horns, burning eyes, savage |
| Devil | precise devil, red or violet skin, symmetrical horns, cruel smile |
| Angel | radiant angel, golden aura, serene inhuman beauty, calm authority |
| Elemental | elemental being formed of living flame, stone, water, or wind |
| Fey | fey creature, iridescent skin, oversized eyes, unsettling delight |
| Lycanthrope | half-transformed werewolf, coarse fur, elongating jaw, feral eyes |

---

## Practical notes

- **Refusals.** Generators often refuse gore, nudity, or anything reading as a
  real minor. For undead, ask for "stylised and grim, not gory". For the Child
  category, "wholesome storybook illustration" is usually the phrasing that
  works.
- **Consistency beats volume.** Twenty commoners in one style look better in
  play than sixty in five styles.
- **Naming does not matter** once you are sorting into folders — the module
  hashes the path for its processed files, so the generator's default filenames
  are fine.
- **Check one before batching.** Generate a single image, drop it in, run
  **Process Set**, and look at the token before producing thirty more.
