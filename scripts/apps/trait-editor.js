/**
 * The trait editor.
 *
 * Traits are world-wide: `race` means the same thing in every category. They
 * were previously editable only through the category editor, which put a global
 * vocabulary behind a screen named after one category — misleading enough that
 * people reasonably concluded custom traits were not supported at all.
 *
 * This is that vocabulary on its own terms. It also shows how many images carry
 * each value, because removing a value nothing uses is housekeeping and removing
 * one four hundred images carry is destructive, and the two are indistinguishable
 * without a number.
 *
 * Edits are made against a working copy of the overlay and only committed on
 * save, so a mis-click costs nothing until then.
 */

import { MODULE_ID, FRAMING_FACET } from '../constants.js';
import {
  facets as allFacets, facetUsage, draftOverlay, commit, ensureOverlayFacet,
} from '../library/index.js';
import { slugify } from '../storage/paths.js';
import { libApi } from '../integrations/lib.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class TraitEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-trait-editor',
    tag: 'form',
    classes: ['stl', 'stl-window', 'stl-trait-editor'],
    window: { title: 'STL.Traits.Title', icon: 'fas fa-tags', resizable: true },
    position: { width: 680, height: 720 },
    form: { handler: TraitEditor.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: {
      addTrait:    TraitEditor.#onAddTrait,
      removeTrait: TraitEditor.#onRemoveTrait,
      addValue:    TraitEditor.#onAddValue,
      removeValue: TraitEditor.#onRemoveValue,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/trait-editor.hbs`, scrollable: ['.stl-traits'] },
  };

  constructor(options = {}) {
    super(options);
    this.browser = options.browser ?? null;
  }

  /**
   * Working copy: `[{ id, label, values, isNew }]`.
   * Seeded from the live traits, which include any an art pack contributed.
   * @type {Array<object>|null}
   */
  #traits = null;

  get traits() {
    this.#traits ??= allFacets().map(f => ({
      id: f.id,
      label: f.label,
      values: [...f.values],
      isNew: false,
    }));
    return this.#traits;
  }

  async _prepareContext() {
    const usage = facetUsage();

    return {
      traits: this.traits.map((trait, index) => {
        const counts = usage.get(trait.id) ?? new Map();
        const values = [...trait.values]
          // Values nothing uses sort last, so the vocabulary you actually rely
          // on stays at the front of a long list.
          .map(value => ({ value, count: counts.get(value) ?? 0 }))
          .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

        // Values on images that the trait no longer lists — usually because a
        // folder or filename introduced one. Shown so they can be adopted.
        const stray = [...counts.entries()]
          .filter(([value]) => !trait.values.includes(value))
          .map(([value, count]) => ({ value, count }))
          .sort((a, b) => b.count - a.count);

        return {
          index,
          id: trait.id,
          label: trait.label,
          isNew: trait.isNew,
          // Framing drives which images count as portraits, so renaming its id
          // would quietly unhook that. Its values are fixed for the same reason.
          locked: trait.id === FRAMING_FACET,
          values,
          stray,
          hasStray: stray.length > 0,
          used: values.reduce((n, v) => n + v.count, 0),
        };
      }),
      hasTraits: this.traits.length > 0,
    };
  }

  /** Pull typed-in ids and labels back into the draft before any re-render. */
  #syncFromForm() {
    const form = this.element;
    if (!form) return;
    const data = foundry.utils.expandObject(
      new foundry.applications.ux.FormDataExtended(form).object,
    );
    const rows = data.traits ?? {};
    for (const [index, row] of Object.entries(rows)) {
      const trait = this.traits[Number(index)];
      if (!trait) continue;
      if (trait.isNew) trait.id = slugify(row.id ?? '');
      trait.label = String(row.label ?? '').trim() || trait.label;
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  static #onAddTrait() {
    this.#syncFromForm();
    this.traits.push({ id: '', label: '', values: [], isNew: true });
    this.render();
  }

  static async #onRemoveTrait(event, target) {
    this.#syncFromForm();
    const trait = this.traits[Number(target.dataset.index)];
    if (!trait) return;

    const counts = facetUsage().get(trait.id);
    const used = counts ? [...counts.values()].reduce((a, b) => a + b, 0) : 0;
    if (used) {
      const confirmed = await confirmDialog(
        game.i18n.localize('STL.Traits.RemoveTraitTitle'),
        game.i18n.format('STL.Traits.RemoveTraitMessage', { label: trait.label || trait.id, count: used }),
      );
      if (!confirmed) return;
    }

    this.traits.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onAddValue(event, target) {
    this.#syncFromForm();
    const index = Number(target.dataset.index);
    const trait = this.traits[index];
    if (!trait) return;

    const input = this.element.querySelector(`[data-new-value="${index}"]`);
    // One box, several values: pasting a comma-separated list is how a real
    // vocabulary gets entered, and typing them one at a time is a chore.
    const added = String(input?.value ?? '')
      .split(/[,\n]/)
      .map(v => v.trim())
      .filter(Boolean);
    if (!added.length) return;

    for (const value of added) {
      if (!trait.values.includes(value)) trait.values.push(value);
    }
    if (input) input.value = '';
    this.render();
  }

  static async #onRemoveValue(event, target) {
    this.#syncFromForm();
    const trait = this.traits[Number(target.dataset.index)];
    if (!trait) return;
    const value = target.dataset.value;
    const count = Number(target.dataset.count) || 0;

    if (count) {
      const confirmed = await confirmDialog(
        game.i18n.localize('STL.Traits.RemoveValueTitle'),
        game.i18n.format('STL.Traits.RemoveValueMessage', { value, count }),
      );
      if (!confirmed) return;
    }

    trait.values = trait.values.filter(v => v !== value);
    this.render();
  }

  static async #onSubmit() {
    this.#syncFromForm();

    const seen = new Set();
    const keep = [];
    for (const trait of this.traits) {
      const id = slugify(trait.id);
      if (!id) continue;               // An unnamed new row is simply discarded.
      if (seen.has(id)) {
        ui.notifications?.warn(game.i18n.format('STL.Traits.DuplicateId', { id }));
        return;
      }
      seen.add(id);
      keep.push({ ...trait, id });
    }

    const draft = draftOverlay();
    for (const trait of keep) {
      const entry = ensureOverlayFacet(draft, trait.id, trait.label || trait.id);
      entry.values = [...new Set(trait.values)];
    }
    // A trait dropped here has to go from the overlay too, or the next load
    // would simply put it back.
    draft.facets = draft.facets.filter(f => seen.has(f.id));

    await commit(draft);
    log.log(`traits saved: ${keep.length} trait(s)`);
    ui.notifications?.info(game.i18n.format('STL.Traits.Saved', { count: keep.length }));
    await this.browser?.refresh();
  }
}

/** Confirmation dialog, preferring the lib's shared helper. */
async function confirmDialog(title, content) {
  const dialogs = libApi()?.utils?.dialogs;
  if (dialogs?.confirm) return dialogs.confirm(title, content);
  const result = await foundry.applications.api.DialogV2.confirm({
    window: { title }, content, rejectClose: false,
  });
  return result === true;
}
