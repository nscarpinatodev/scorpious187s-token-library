# Generating token art with ChatGPT

A working recipe for producing library art in batches, plus prompt fragments for
every category in the starter set.

The short version: paste **[the setup block](#block-a--setup)** once per
category, then paste **[a run block](#block-b--run)** for each batch of ten.
ChatGPT plans ten named variants, generates them one at a time, and
[a rename helper](#renaming-a-run) drops them into the library already tagged.
[The build plan](#building-the-whole-catalogue) says which runs to do and in
what order.

---

## Contents

- [What the module needs from an image](#what-the-module-needs-from-an-image)
- [The base prompt](#the-base-prompt)
- [The batch script](#the-batch-script) — the three blocks you paste
- [Naming so the library tags itself](#naming-so-the-library-tags-itself)
- [Renaming a run](#renaming-a-run)
- [Building the whole catalogue](#building-the-whole-catalogue)
- [Category prompt fragments](#category-prompt-fragments)
- [Practical notes](#practical-notes)

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

## The batch script

The base prompt above is enough to make *one* good image. Producing a catalogue
needs two more things it does not give you: ten images that differ from each
other in useful ways, and a filename for each one that the library can read.

The script below adds both. It is three blocks. **Setup** goes in once per
conversation, **Run** goes in once per batch of ten, and **Continue** is the
single word you send between images.

### How a session goes

```
new conversation
  └─ Block A: setup ................... once, per category
       └─ Block B: run ................. per batch of ten
            ├─ ChatGPT prints 10 filenames — you save them as names.txt
            ├─ you send "go"
            ├─ image 1 … you send "next" … image 2 … (×10)
            └─ Rename-TokenBatch names.txt storage/art/<category>
       └─ Block B again for the next batch
new conversation when you change category
```

One conversation per category. Style drifts across a long thread, and it drifts
much faster across a change of subject — a thread that has made thirty guards
will quietly make your commoners look like off-duty guards.

### Block A — setup

Paste once, at the top of a fresh conversation. It is the base prompt plus the
batch discipline.

> You are generating character tokens for a virtual tabletop. We are going to
> work in batches of ten. Read all of this before replying.
>
> **Image rules — apply to every image, without exception:**
> - Square 1:1, 1024×1024.
> - Bust framing: head and shoulders to mid-chest. The head fills roughly the
>   upper third. Never full-body, never below the chest.
> - Subject centred, facing the viewer or slightly turned. Nothing important in
>   the outer sixth of the frame.
> - Even, neutral front lighting. No rim light, no lens flare, no god rays.
> - Plain, softly blurred background in a muted colour. No scenery, props,
>   furniture, or horizon lines.
> - Painterly fantasy illustration. Identical style, palette treatment, and
>   lighting across every image in this conversation.
> - No text, watermarks, logos, signatures, borders, frames, or circular
>   vignettes.
>
> **Batch rules:**
> - When I send a RUN, first reply with a numbered plan of ten variants and
>   nothing else. No images yet.
> - Each plan line is exactly: `NN. <filename> — <one-line description>`.
> - The ten must be visibly different people. Vary at least three of: face
>   shape, skin tone, hair colour and style, facial hair, apparent age within
>   the stated range, build, expression, and one distinguishing feature (scar,
>   freckles, broken nose, missing ear, tattoo, unusual eye colour). Do not
>   vary the art style, the lighting, or the framing.
> - Then wait. When I say "go", generate image 01 only, with its filename as
>   the caption. When I say "next", generate the following one. One image per
>   message.
> - Never re-plan, re-summarise, or ask whether I want changes between images.
> - If an image is refused or fails, say only which number failed and continue
>   from the next when I say "next".
>
> Confirm in one line, then wait.

### Block B — run

Paste once per batch of ten. Fill in the three fields; everything else is fixed.

> RUN
> Category: `guard`
> Fixed traits: `race: human`, `gender: male`
> Varying: age (young to middle-aged), build, expression
> Description: mail shirt under a city tabard, open helm, bored watchful
> expression
> Filenames: `guard-human-male-01.png` through `guard-human-male-10.png`
>
> Plan the ten now.

A **mixed** run — used for the first pass over a category, where you want range
rather than depth — states the traits per image instead:

> RUN
> Category: `guard`
> Fixed traits: none
> Varying: race, gender, age, build
> Description: mail shirt under a city tabard, open helm, bored watchful
> expression
> Filenames: `guard-<race>-<gender>-NN.png`, using only these race values —
> human, elf, half-elf, dwarf, halfling, gnome, half-orc, tiefling,
> dragonborn — and only these gender values — male, female.
> Spread the ten across at least five races and both of male and female.
> Spell the values exactly as written above, lowercase, hyphens intact.
>
> Plan the ten now.

That "spell the values exactly" line is the one that earns its keep. The library
matches filename words against its trait list literally, so `halforc`,
`Half Orc`, and `orcish` all tag nothing, while `half-orc` tags correctly.

### Block C — continue

`next`

That is the whole block. Resist elaborating: any extra words invite ChatGPT to
reconsider the style, and a "make it a bit more heroic" halfway through a run
costs you the consistency the run existed to produce.

Two other one-liners worth having ready:

| You send | When |
|---|---|
| `redo 04` | An image broke the framing or style rules. |
| `skip 07, continue` | An image was refused and rephrasing is not worth it. |
| `Keep this exact art style, lighting, and framing for everything that follows.` | After the first image of the conversation, once you like it. |

Attaching an approved image as a style reference at the top of a new
conversation works better than describing the style again.

---

## Naming so the library tags itself

The module reads traits from two places, and gets them from the generator for
free if you name files properly. **Folders win over filenames, and the manifest
wins over both**, so the two schemes below can be combined without conflict.

### The filename grammar

```
<category>-<trait value>-<trait value>-…-NN.png
```

```
guard-human-male-01.png            → race: human, gender: male
commoner-half-orc-female-03.png    → race: half-orc, gender: female
scout-elf-female-elderly-07.png    → race: elf, gender: female, age: elderly
```

Rules the parser actually applies:

- Words are split on hyphens, underscores, dots, spaces, and CamelCase humps,
  so `guard-Half Orc-male-04.png` tags `race: half-orc` correctly.
- **Purely numeric words are dropped**, which is what makes the `-01` suffix
  free — but only when it is a *separate* word. `GuardHumanMale01.png` reads
  as `male01` and loses the gender tag entirely; `Guard-Human-Male-01.png` is
  fine. Always separate the sequence number. `-1st` is not numeric and reads as
  an unknown word.
- Longer trait values are matched first, so `half-orc` is consumed before `orc`
  can claim it, and `female` before `male`.
- A word matching nothing is simply ignored by the folder scan. In the **Add
  Images** dialog it is offered as a *new* trait value instead — which is how
  the race list grows, and also how a typo becomes a permanent trait value if
  you click through without reading.

### The folder shortcut

Every folder under a category is checked against the trait values too, and
nesting order does not matter:

```
storage/art/blacksmith/dwarf/male/01.png       → race: dwarf, gender: male
storage/art/guard/elf/female/elderly/03.png    → race: elf, gender: female, age: elderly
storage/art/guard/batch-2/raw/…                → ignored, just organisation
```

Use folders for a **fixed-trait run** — ten images that share race and gender —
because the whole batch drops into one directory and needs no naming at all.
Use filenames for a **mixed run**, where each image carries different traits.
Doing both costs nothing and makes the library readable from a file manager:

```
storage/art/guard/human/male/guard-human-male-01.png
```

A fixed-trait folder has one extra benefit in **frame** mode: when a filter
selects exactly every image in a single directory, the actor gets a native
Foundry wildcard, which keeps working even if this module is later disabled.
That only happens when the folder holds one file extension, so do not mix `.png`
and `.webp` in the same directory.

### Trait values, spelled exactly

These are the values the starter set installs. Anything else in a filename is
an unknown word.

| Trait | Values |
|---|---|
| race | human, elf, half-elf, dwarf, halfling, gnome, half-orc, orc, tiefling, dragonborn, goblin, kobold, lizardfolk, catfolk, aasimar, genasi, goliath, firbolg, tabaxi, kenku, leshy |
| gender | male, female |
| age | child, young, adult, middle-aged, elderly |
| build | slight, average, stocky, muscular, heavy |
| environment | urban, rural, wilderness, coastal, underground, desert, arctic |
| armour | unarmoured, light, medium, heavy, robes |
| mood | friendly, neutral, hostile, wary, wounded |

Three collisions to know about:

- **`heavy` is both a build and an armour value**, so `knight-human-male-heavy-01`
  gets tagged `build: heavy` *and* `armour: heavy`. Usually harmless; if you
  mean only one, tag that image in the browser instead.
- **`child` is both a category and an age value.** Files in `art/child/` named
  `child-…` pick up `age: child`, which is what you want.
- **Several categories share a name with a race** — goblin, kobold, orc,
  lizardfolk. `goblin-goblin-male-01` is not a typo worth fixing; the second
  word tags the race and the first names the category.

Only encode traits you will actually filter on. Race and gender earn their keep
immediately. Build and environment mostly do not, and every extra field is
another chance for a run of ten to end up mis-tagged.

---

## Renaming a run

ChatGPT names downloads after the clock, not the subject. Rather than fight it,
let the download order carry the meaning: images arrive in the order they were
generated, which is the order of the plan ChatGPT printed.

**The flow per run:**

1. ChatGPT prints its ten-line plan. Copy the filenames out of it into
   `names.txt`, one per line.
2. Send `go`, then `next` nine times, downloading each image as it appears.
3. Run the helper. It takes the ten newest images from your downloads folder,
   in creation order, and moves them into the library under the planned names.

Add this to your PowerShell profile (`notepad $PROFILE`):

```powershell
function Rename-TokenBatch {
  param(
    [Parameter(Mandatory)][string]$Names,   # names.txt, one filename per line
    [Parameter(Mandatory)][string]$To,      # storage/art/<category>[/<trait>/…]
    [string]$From = (Join-Path $HOME 'Downloads')
  )

  $targets = @(Get-Content $Names | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  $files   = @(Get-ChildItem (Join-Path $From '*') -Include *.png,*.webp,*.jpg -File |
               Sort-Object CreationTime | Select-Object -Last $targets.Count)

  if ($files.Count -ne $targets.Count) {
    throw "$From holds $($files.Count) matching images; $Names lists $($targets.Count)."
  }
  if (-not (Test-Path $To)) { New-Item -ItemType Directory -Force $To | Out-Null }

  for ($i = 0; $i -lt $targets.Count; $i++) {
    Move-Item -LiteralPath $files[$i].FullName -Destination (Join-Path $To $targets[$i])
    '{0} -> {1}' -f $files[$i].Name, $targets[$i]
  }
}
```

```powershell
Rename-TokenBatch names.txt .\storage\art\guard
```

The equivalent in bash:

```bash
rename_token_batch() {   # rename_token_batch names.txt storage/art/guard [~/Downloads]
  local names="$1" to="$2" from="${3:-$HOME/Downloads}" n
  n=$(grep -c . "$names")
  mkdir -p "$to"
  ls -tr "$from"/*.png "$from"/*.webp 2>/dev/null | tail -n "$n" |
    paste - "$names" |
    while IFS=$'\t' read -r src dst; do mv -- "$src" "$to/$dst"; done
}
```

It moves rather than copies, so a second run cannot pick up the first run's
images by mistake — and if a run went wrong, the downloads folder is empty
afterwards, which tells you before the library does. Keep the downloads folder
clear of anything else while a run is in flight, or point `-From` at a staging
directory you drag into.

Then hit **Refresh** in the browser sidebar, and **Process Set** before you
judge the result.

---

## Building the whole catalogue

69 starter categories at ten images each is 690 images, and the full trait
matrix is a five-figure number nobody needs. The passes below are ordered so
that stopping after any one of them leaves you with a coherent library rather
than a half-finished one.

### Pass 1 — the spine

One **mixed** run per category. 69 runs, **690 images**. Every category has art,
every drop finds something, and race and gender are already varied enough that
a table of five players does not see the same face twice in a session.

| Group | Categories | Runs | Images |
|---|---|---|---|
| Townsfolk | 12 | 12 | 120 |
| Law and war | 9 | 9 | 90 |
| Criminals | 7 | 7 | 70 |
| Faith and magic | 11 | 11 | 110 |
| Humanoid folk | 17 | 17 | 170 |
| Undead | 7 | 7 | 70 |
| Outsiders | 6 | 6 | 60 |
| **Total** | **69** | **69** | **690** |

For the 30 categories under Humanoid folk, Undead, and Outsiders, the species
*is* the category — run those with `Fixed traits: none` and vary only age,
build, and expression. There is no race to spread across.

Order the work by what your campaign touches this month. If it is an urban
game, the first ten runs are commoner, guard, merchant, noble, thug, thief,
innkeeper, servant, labourer, and beggar, and the giants can wait indefinitely.

### Pass 2 — depth where it shows

Three more runs each on the dozen or so categories that carry every session.
**15 categories × 3 runs = 450 images.** These are the ones a party meets in
crowds, where two identical faces are noticed immediately:

commoner, guard, bandit, noble, merchant, soldier, thug, thief, sailor,
innkeeper, acolyte, cultist, mage, scout, mercenary.

Run these mixed as well. You are buying *count*, not coverage.

### Pass 3 — trait coverage

Only for categories you filter by trait in play. One **fixed-trait** run per
combination, filed into folders. The standard six is a good default set:

| # | Folder | Fixed traits |
|---|---|---|
| 1 | `<category>/human/male/` | race: human, gender: male |
| 2 | `<category>/human/female/` | race: human, gender: female |
| 3 | `<category>/elf/female/` | race: elf, gender: female |
| 4 | `<category>/dwarf/male/` | race: dwarf, gender: male |
| 5 | `<category>/tiefling/female/` | race: tiefling, gender: female |
| 6 | `<category>/half-orc/male/` | race: half-orc, gender: male |

Six runs is 60 images per category. Applied to the 39 people-categories that is
2,340 images and roughly forty hours of clicking, which is why this is a pass
you apply to five categories rather than all of them. Swap the six for whatever
species your setting actually has — a campaign with no tieflings gains nothing
from ten of them.

### Totals

| After | Images | Roughly |
|---|---|---|
| Pass 1 | 690 | a usable library |
| Pass 1 + 2 | 1,140 | crowds stop repeating |
| Pass 1 + 2 + 3 on five categories | 1,440 | trait filters worth using |

At a generated image every 15–30 seconds plus the planning turn, a run of ten
is five to eight minutes of attention. Pass 1 is a long weekend, not an evening.
Check your ChatGPT plan's image cap before starting — hitting it mid-run leaves
a batch that the rename helper will refuse, which is the correct behaviour but
an annoying way to find out.

### Tracking progress

The folder tree is the tracker. This prints image counts per category, thinnest
first, which is also the order to work in:

```powershell
Get-ChildItem .\storage\art -Directory | ForEach-Object {
  [pscustomobject]@{
    Category = $_.Name
    Images   = @(Get-ChildItem $_.FullName -Recurse -File -Include *.png,*.webp,*.jpg).Count
  }
} | Sort-Object Images | Format-Table -AutoSize
```

Categories with no folder at all do not appear — cross-check against
**Hide empty** in the browser sidebar, which collapses exactly the categories
you have not reached yet.

A plain text ledger dropped at `storage/art/_runs.tsv` is ignored by the scan
(it only looks at directories and image files), so it is a safe place to note
which runs were mixed, which conversation produced them, and which came out
badly enough to redo.

---

## Category prompt fragments

Append one of these to `A {race} {gender}, {age}, ` and send it as the
`Description:` line of a run block. They are written to describe *the person*,
not the scene, since the base prompt already handles framing and background.

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

Send these without the `{race}` prefix — the species *is* the category. Set
`Fixed traits: none` and vary age, build, and expression.

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

**Varying ten of one species** is the hardest case in the whole catalogue —
ten goblins tend to come back as one goblin ten times. Add this to the run
block: *"These are ten individuals of one species. Vary skin or hide colour
within a plausible range, ear and horn shape, scarring, war paint, jewellery,
teeth, and age. Two of the ten should read as old, one as very young."*

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

- **Check one before batching.** Generate a single image, drop it in, run
  **Process Set**, and look at the token before producing thirty more. The
  failure you are looking for is a head that reads as tiny inside the ring,
  which is invisible in the source image and obvious on the canvas.
- **Refusals.** Generators often refuse gore, nudity, or anything reading as a
  real minor. For undead, ask for "stylised and grim, not gory". For the Child
  category, "wholesome storybook illustration" is usually the phrasing that
  works. A refusal mid-run is not worth arguing with — `skip 07, continue`, and
  delete the corresponding line from `names.txt` before renaming.
- **Consistency beats volume.** Twenty commoners in one style look better in
  play than sixty in five styles. If a run comes back in a different style from
  the rest of its category, it is cheaper to bin it than to keep it.
- **Style drift within a run** is the thing to watch on images 8, 9, and 10 —
  they wander. Comparing the tenth against the first, rather than against the
  ninth, is how you catch it.
- **One extension per folder.** Mixed `.png` and `.webp` in one directory
  disables the native-wildcard path in frame mode. It still works, just via the
  module rather than Foundry.
- **Names only have to be right once.** The module hashes the source path for
  its processed files, so renaming source art after it has been baked orphans
  the cache. Deleting `baked/` fixes it at the cost of a re-run.
