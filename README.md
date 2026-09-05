# Scorpious187's Token Library

A categorised, facet-tagged token art library for Foundry VTT that you can grow
from inside the game.

Browse hundreds of token images by category and traits, apply them to actors or
placed tokens, and render them through either Foundry's dynamic token ring or a
frame of your choosing. Art lives in persistent storage that survives module
updates.

- **Foundry**: v13 minimum, verified on v14
- **Requires**: [Scorpious187's Module Library](https://github.com/nscarpinatodev/scorpious187s-lib)
- **Optional**: [Tokenizer 2](https://www.patreon.com/MrPrimate) — adds frame baking
  and the editor round-trip on import. Everything else works without it.
- **Licence**: MIT for the code, [CC0](ART-LICENSE.md) for the shipped art

---

## What it does

| | |
|---|---|
| **Browse** | Category list, trait filter chips, thumbnail grid. Filter by race, gender, environment — any trait you define. |
| **Apply** | To selected tokens, or to an actor so every future drop varies. |
| **Two ring modes** | Foundry's dynamic ring, or a frame composited into the artwork by Tokenizer 2. |
| **Grow it in-game** | Drag images in, add categories, add traits and values. No JSON editing required. |
| **Auto-apply** | Actors whose names match a category get art automatically when dropped on the canvas. |
| **Portraits** | Non-square art is kept out of token pools and applied to the actor's avatar instead. |

## How art is organised

Everything lives under one library folder, which defaults to this module's
persistent storage (`modules/scorpious187s-token-library/storage`):

```
manifest.json                              categories, traits, image tags
art/<category>/<file>.webp                 borderless subject art
baked/<variantId>/<category>/<file>.webp   processed variants (a cache)
frames/<file>.webp                         your frame images
```

`manifest.json` is the contract. It records the traits you can filter on, the
categories, and which traits each image has:

```jsonc
{
  "version": 1,
  "facets": [
    { "id": "race",   "label": "Race",   "values": ["human", "elf", "tiefling"] },
    { "id": "gender", "label": "Gender", "values": ["male", "female"] }
  ],
  "categories": [
    {
      "id": "commoner",
      "label": "Commoner",
      "match": { "names": ["commoner", "peasant"], "creatureTypes": ["humanoid"] },
      "images": [
        { "file": "art/commoner/commoner-human-female-01.webp",
          "facets": { "race": "human", "gender": "female" } }
      ]
    }
  ]
}
```

You rarely need to touch it. Images dropped into `art/<category>/` are picked up
on the next rescan, and their traits come from two places automatically.

**Subfolders are traits** — the cheapest way to tag a generated batch:

```
art/commoner/elf/female/01.png     → race: elf, gender: female
art/guard/dwarf/male/elderly/2.png → race: dwarf, gender: male, age: elderly
```

Folder names are matched against known trait values, so nesting order does not
matter, and folders matching nothing (`batch-2`, `raw`) are treated as plain
organisation and ignored.

**Filenames are also read** — `commoner-human-female-01.webp` is tagged
`race: human, gender: female`. Folders win over filenames, and the manifest wins
over both.

See [docs/PROMPTS.md](docs/PROMPTS.md) for generating art with ChatGPT,
including prompt fragments for every starter category.

Inference only helps when filenames actually say something, which AI-generated
names usually do not. For those, select thumbnails in the browser (ctrl- or
shift-click for several, or **Select All Matching**) and tick trait values in
the tag panel. Untagged images are flagged with a tag icon so they are easy to
find.

An image can hold **several values of the same trait** — a token that reads as
both a guard and a soldier can carry both, and will surface under either filter.
Traits you don't touch in the panel are left exactly as they are, so tagging
Race never disturbs Gender.

## Token art and portraits

A generated character usually arrives as a set: a square token crop, and the 3:4
portrait or reference sheet it was cut from, both in the same folder. Only the
square one belongs on the canvas — a reference sheet stretched across a token
reads as a bug.

So **any file whose name carries `portrait` is treated as portrait art**: it is
excluded from every randomisation pool, never baked, and does not count towards a
category's image count. Instead it is paired with the token art of the same
subject, and applying that art sets the **actor's avatar** to the portrait. The
token itself is unaffected.

```
art/dragonriders/dragon-imperium/
  dragon-imperium-01-human-male-token-1x1.png      → the token
  dragon-imperium-01-human-male-portrait-3x4.png   → the avatar
```

Pairing works two ways. If a token and a portrait reduce to the same name once
framing markers (`portrait`, `token`, `square`, `1x1`, `3x4`) are stripped, they
are a pair — that is the case above. Otherwise, if a folder holds a single
subject, because everything in it shares a leading name the way
`uniques/zolra/` does, the closest-matching portrait in it is used:

```
art/uniques/zolra/
  unique-zolra-storm-sorceress-bust-1x1.webp           → the token
  unique-zolra-storm-sorceress-full-body-portrait.webp → the avatar
```

Numbers in a name are respected, so in a numbered set rider 03 will never inherit
rider 01's face — it simply goes unpaired. A category folder of hundreds of
unrelated commoners shares no leading name, so nothing there is paired by
accident either.

Thumbnails with a paired portrait are marked with a person icon in the browser.
Turn the whole behaviour off with **Use Portrait Art as Actor Avatar** if you
would rather manage avatars yourself; images with no paired portrait never touch
the avatar regardless.

You can also set the `framing` trait by hand in the tag panel to mark art the
filename never declared — or to rescue a token whose name happens to contain the
word "portrait".

## Categories vs traits

Categories are **roles** — Guard, Bandit, Acolyte. Traits are everything else —
race, gender, age, build, environment. That split matters: one pool of guard art
usually has to serve elves and dwarves alike, and splitting the pool by species
instead would mean re-cutting it every time a new species turns up.

The **starter set** button in the sidebar adds 69 common D&D and Pathfinder NPC
categories with their name aliases, plus seven traits and their values. It only
fills in what is missing, so it is safe to run on an existing library and safe
to run twice. **Hide empty** collapses the categories you have no art for yet.

You do not have to use traits at all. Categories alone give you "drop a
Commoner, get a random commoner"; traits only earn their keep when one category
needs to serve visibly different actors.

## Ring modes

**Dynamic Token Ring** — Foundry draws the ring, and the clipped artwork is
handed to it as an explicit subject via `ring.subject.texture` with
`ring.subject.scale` at 1, matching what Tokenizer 2 writes for its own dynamic
ring tokens.

The artwork is clipped to a circle sized to **two thirds** of the token, which
is the subject size Foundry's rings are built around (`TokenRing`'s
`#defaultSubjectThickness`). A full-bleed image reaches the token's edge and
covers the ring band instead of sitting inside it. **Subject Clipping** controls
this:

| Mode | Behaviour |
|---|---|
| **Circle** (default) | A procedural inscribed circle. No asset needed, so nothing to misconfigure. |
| **Custom mask image** | Artwork is kept where the mask is **opaque** and erased where it is transparent. A solid shape on a transparent background — Tokenizer 2's masks under `modules/tokenizer-2/img/masks/` work well. |
| **None** | Artwork used untouched, for art that is already circular on transparency. |

**Selected Token Frame** — the artwork is clipped, then your chosen frame is
drawn over it, and the flat result becomes the token texture with the dynamic
ring off.

Both modes therefore write a processed file per image, under
`baked/<variantId>/`. Applying a whole filtered set needs a one-time **Process
Set** pass; the browser tells you when that is pending.

The variant id encodes the frame and clipping settings, so changing either
writes to a fresh directory rather than colliding with stale output. These files
are pure cache — deleting `baked/` only costs a re-run, and is the way to force
everything to regenerate.

## How art gets picked

1. **A selection you saved in the browser.** Always wins.
2. **A category match**, for actors you never configured — name aliases first,
   then whole-word containment (so `Bandit Captain` finds the `bandit`
   category), then creature type. Only applies to actors still using default
   token artwork, so deliberate portraits are never overwritten.
3. **Nothing.** The token is left alone.

In **frame** mode, when a filter happens to select every image in a single
folder, the actor gets a native Foundry wildcard (`randomImg`), which keeps
working even if this module is later disabled. Arbitrary trait filters have no
glob equivalent, so those are stored on the actor and rolled at token-creation
time instead.

**Dynamic ring** mode always rolls per token. A dynamic ring pins its own
subject texture, so `randomImg` would randomise `texture.src` while every token
still rendered the same subject — variety has to come from this module.

## Adding art

Open the browser (token controls, an actor sheet header, the token HUD, or the
actor directory context menu) and use **Add Images**. You can drop files in,
pick them from disk, or link images that already live in your data directory
without copying them.

Unrecognised words in the filenames are offered as new trait values — that is
how the race list grows without opening JSON.

## Removing art

Select thumbnails and hit **Remove**. Foundry gives modules no way to delete
files, so the image files stay in your data folder — they are simply no longer
part of the library, and the folder scan will not pick them up again. **Restore
Removed** brings a category's removed images back; deleting the files for real
is a job for your file manager.

## Storage and moving the library

The default location is the module's own persistent storage, which Foundry
preserves across module updates. Nothing is copied on first run.

If you point **Library Folder** somewhere else, the contents are copied there,
with the folder tree intact to whatever depth it goes — subfolders carry your
trait tagging, so a copy that flattened them would lose the tagging along with
the layout.

Foundry has no server-side copy, so that means one download and one upload per
file, through your browser. It runs in batches with progress, and resumes if
interrupted. Baked composites are skipped — regenerating them is cheaper than
copying them.

## API

```js
const api = game.modules.get('scorpious187s-token-library').api;

api.openBrowser({ actor });                    // open the browser, optionally targeted
api.library.categories();                      // all categories
api.apply.applyToActor(actor, {                // apply a filtered selection
  categoryId: 'commoner',
  facets: { race: ['human'], gender: ['female'] },
  file: null,
});
api.matching.matchCategory(actor);             // what category would this actor get?
```

Hooks:

| Hook | Fired when |
|---|---|
| `scorpious187s-token-library.ready` | The index is built and queryable. |
| `scorpious187s-token-library.changed` | The manifest changed. |

## Art packs

A companion module can ship art by declaring itself in its manifest:

```json
"flags": {
  "scorpious187s-token-library": { "artPack": true, "manifest": "manifest.json" }
}
```

Its `manifest.json` uses the same schema, with `file` paths relative to that
module's own root. Art packs are read-only; your edits always land in your own
library folder.

## Credits

Inspired by [Too Many Tokens](https://github.com/IsThisMyRealName/too-many-tokens-dnd)
by IsThisMyRealName, which pioneered the wildcard-driven approach to token
variety in Foundry. This module is an independent implementation with an
explicit manifest, an in-game editor, and token ring support.

[Tokenizer 2](https://www.patreon.com/MrPrimate) by MrPrimate is used for
authoring — the editor round-trip when importing images, and its frame browser.
Bulk library processing is done in-module with a plain canvas, so its behaviour
is fully defined here rather than depending on another module's internals.

## Licence

- **Code** — MIT, see [LICENSE](LICENSE).
- **Token art** — CC0 public domain dedication, see [ART-LICENSE.md](ART-LICENSE.md),
  which also covers how the art was generated and what that means for reuse.
