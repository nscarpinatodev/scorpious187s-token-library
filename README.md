# Scorpious187's Token Library

A categorised, facet-tagged token art library for Foundry VTT that you can grow
from inside the game.

Browse thousands of token images by category and traits, apply them to actors or
placed tokens, and render them through either Foundry's dynamic token ring or a
frame of your choosing. Art lives in persistent storage that survives module
updates.

- **Foundry**: v13 minimum, verified on v14
- **Requires**: [Scorpious187's Module Library](https://github.com/nscarpinatodev/scorpious187s-lib), [Tokenizer 2](https://www.patreon.com/MrPrimate)

---

## What it does

| | |
|---|---|
| **Browse** | Category list, trait filter chips, thumbnail grid. Filter by race, gender, environment — any trait you define. |
| **Apply** | To selected tokens, or to an actor so every future drop varies. |
| **Two ring modes** | Foundry's dynamic ring, or a frame composited into the artwork by Tokenizer 2. |
| **Grow it in-game** | Drag images in, add categories, add traits and values. No JSON editing required. |
| **Auto-apply** | Actors whose names match a category get art automatically when dropped on the canvas. |

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
on the next rescan, and their traits are **inferred from the filename** —
`commoner-human-female-01.webp` is tagged `race: human, gender: female`
automatically. The manifest always wins where it disagrees.

Inference only helps when filenames actually say something, which AI-generated
names usually do not. For those, select thumbnails in the browser (ctrl- or
shift-click for several, or **Select All Matching**) and assign traits from the
tag panel. Untagged images are flagged with a tag icon so they are easy to find.

## Ring modes

**Dynamic Token Ring** — Foundry draws the ring. `ring.enabled` is turned on and
`ring.subject.texture` is deliberately left blank, because Foundry only
overrides the ring's subject mesh when that field is set; leaving it empty means
the ring wraps whatever image was actually chosen. That is what lets randomised
art keep its ring.

The artwork is first clipped to the ring's inner circle, using Tokenizer 2's
circle mask by default — a square portrait dropped straight into a dynamic ring
spills outside it. If your art is already circular on a transparent background,
clear the **Dynamic Ring Subject Mask** setting and the raw file is used as-is
with no processing at all.

**Selected Token Frame** — the artwork is composited onto your chosen frame by
Tokenizer 2 and the flat result becomes the token texture, with the dynamic ring
off.

Both modes therefore write a processed file per image, under
`baked/<variantId>/`. Applying a whole filtered set needs a one-time **Process
Set** pass; the browser tells you when that is pending. These files are pure
cache — deleting them only costs a re-run.

## How art gets picked

1. **A selection you saved in the browser.** Always wins.
2. **A category match**, for actors you never configured — name aliases first,
   then whole-word containment (so `Bandit Captain` finds the `bandit`
   category), then creature type. Only applies to actors still using default
   token artwork, so deliberate portraits are never overwritten.
3. **Nothing.** The token is left alone.

When a filter happens to select every image in a single folder, the actor gets a
native Foundry wildcard (`randomImg`), which keeps working even if this module is
later disabled. Arbitrary trait filters have no glob equivalent, so those are
stored on the actor and rolled at token-creation time instead.

## Adding art

Open the browser (token controls, an actor sheet header, the token HUD, or the
actor directory context menu) and use **Add Images**. You can drop files in,
pick them from disk, or link images that already live in your data directory
without copying them.

Unrecognised words in the filenames are offered as new trait values — that is
how the race list grows without opening JSON.

## Storage and moving the library

The default location is the module's own persistent storage, which Foundry
preserves across module updates. Nothing is copied on first run.

If you point **Library Folder** somewhere else, the contents are copied there.
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

Image compositing is performed by [Tokenizer 2](https://www.patreon.com/MrPrimate)
by MrPrimate.

## Licence

MIT — see [LICENSE](LICENSE).
