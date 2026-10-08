/**
 * Category and facet editor.
 *
 * Covers both "add new categories" and "add new races": a race is just a value
 * of the `race` facet, so one editor handles any trait dimension the GM wants
 * to filter on. Edits are made against a working copy of the overlay manifest
 * and only committed on save.
 *
 * The trait section follows the trait editor's rules: an existing trait's id
 * is fixed, because images are tagged against it and renaming it here would
 * orphan every one of those tags; and framing is locked outright, because it
 * decides which images count as portraits.
 */

import { MODULE_ID, FRAMING_FACET } from '../constants.js';
import {
  category, facets as allFacets, draftOverlay, commit,
  ensureOverlayCategory, ensureOverlayFacet,
} from '../library/index.js';
import { ensureDir } from '../storage/files.js';
import { artDir, source, slugify } from '../storage/paths.js';
import { confirmDialog } from '../integrations/lib.js';
import { splitList, bindValueInputs, pendingValues } from './shared.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class CategoryEditor extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-category-editor',
    tag: 'form',
    classes: ['stl', 'stl-window', 'stl-category-editor'],
    window: { title: 'STL.Category.Title', icon: 'fas fa-folder-tree', resizable: true },
    position: { width: 620, height: 'auto' },
    form: { handler: CategoryEditor.#onSubmit, closeOnSubmit: true, submitOnChange: false },
    actions: {
      addFacet:      CategoryEditor.#onAddFacet,
      addFacetValue: CategoryEditor.#onAddFacetValue,
      removeFacetValue: CategoryEditor.#onRemoveFacetValue,
      deleteCategory: CategoryEditor.#onDeleteCategory,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/category-editor.hbs`, scrollable: ['.stl-editor-scroll'] },
  };

  /** One window per category, plus one for "new", so they never share a DOM id. */
  static idFor(categoryId) {
    return `stl-category-editor-${categoryId || 'new'}`;
  }

  constructor(options = {}) {
    super({ id: CategoryEditor.idFor(options.categoryId), ...options });
    this.categoryId = options.categoryId ?? null;
    this.browser = options.browser ?? null;
  }

  /** @type {object|null} Working copy of the overlay manifest. */
  #draft = null;

  get draft() {
    this.#draft ??= draftOverlay();
    return this.#draft;
  }

  /**
   * Working copy of the traits: `[{ id, label, values, isNew }]`.
   * Seeded from the live traits, which include any an art pack contributed.
   * @type {Array<object>|null}
   */
  #traits = null;

  get traits() {
    this.#traits ??= allFacets().map(f => ({
      id: f.id, label: f.label, values: [...f.values], isNew: false,
    }));
    return this.#traits;
  }

  get isNew() {
    return !this.categoryId;
  }

  async _prepareContext() {
    const existing = this.categoryId ? category(this.categoryId) : null;

    return {
      isNew: this.isNew,
      categoryId: this.categoryId ?? '',
      label: existing?.label ?? '',
      names: (existing?.match.names ?? []).join(', '),
      creatureTypes: (existing?.match.creatureTypes ?? []).join(', '),
      imageCount: existing?.images.length ?? 0,
      readOnly: existing?.readOnly ?? false,
      facets: this.traits.map((trait, index) => ({
        ...trait,
        index,
        locked: trait.id === FRAMING_FACET,
      })),
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    bindValueInputs(this.element);
  }

  /** Pull typed-in ids and labels back into the working copy so re-renders do not lose them. */
  #syncFromForm() {
    const form = this.element;
    if (!form) return;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);
    for (const [index, row] of Object.entries(data.facets ?? {})) {
      const trait = this.traits[Number(index)];
      if (!trait) continue;
      if (trait.isNew) trait.id = slugify(row.id ?? '');
      if (trait.id !== FRAMING_FACET) trait.label = String(row.label ?? '').trim();
    }
  }

  static #onAddFacet() {
    this.#syncFromForm();
    this.traits.push({ id: '', label: '', values: [], isNew: true });
    this.render();
  }

  static #onAddFacetValue(event, target) {
    this.#syncFromForm();
    const index = Number(target.dataset.index);
    const trait = this.traits[index];
    if (!trait || trait.id === FRAMING_FACET) return;
    const added = pendingValues(this.element).get(index) ?? [];
    if (!added.length) return;
    for (const value of added) {
      if (!trait.values.includes(value)) trait.values.push(value);
    }
    this.render();
  }

  static #onRemoveFacetValue(event, target) {
    this.#syncFromForm();
    const trait = this.traits[Number(target.dataset.index)];
    if (!trait || trait.id === FRAMING_FACET) return;
    trait.values = trait.values.filter(v => v !== target.dataset.value);
    this.render();
  }

  static async #onDeleteCategory() {
    if (!this.categoryId) return;
    const existing = category(this.categoryId);
    const confirmed = await confirmDialog(
      game.i18n.localize('STL.Category.DeleteTitle'),
      game.i18n.format('STL.Category.DeleteMessage', {
        label: existing?.label ?? this.categoryId,
        count: existing?.images.length ?? 0,
      }),
    );
    if (!confirmed) return;

    const draft = this.draft;
    draft.categories = draft.categories.filter(c => c.id !== this.categoryId);
    // An action, not the form handler, so nothing upstream reports a failure.
    try {
      await commit(draft);
    } catch (err) {
      ui.notifications?.error(err?.message ?? String(err));
      return;
    }
    log.log(`category "${this.categoryId}" removed from the manifest (files left on disk)`);
    await this.browser?.refresh();
    this.close();
  }

  // Validation failures throw rather than return: Foundry only skips
  // closeOnSubmit when the handler throws, so a plain return closed the editor
  // and discarded the form.
  static async #onSubmit(event, form, formData) {
    this.#syncFromForm();
    const data = foundry.utils.expandObject(formData.object);
    const draft = this.draft;

    const label = String(data.label ?? '').trim();
    const id = this.categoryId ?? slugify(data.categoryId || label);
    if (!id) throw new Error(game.i18n.localize('STL.Category.NeedName'));

    // "New" must mean new: saving onto an existing id would silently replace
    // that category's name and matching rules.
    if (this.isNew && category(id)) {
      throw new Error(game.i18n.format('STL.Category.IdTaken', { id }));
    }

    // A value typed but never added still counts.
    for (const [index, values] of pendingValues(this.element)) {
      const trait = this.traits[index];
      if (!trait || trait.id === FRAMING_FACET) continue;
      for (const value of values) if (!trait.values.includes(value)) trait.values.push(value);
    }

    const seen = new Set();
    for (const trait of this.traits) {
      if (!trait.id) continue;               // An unnamed new row is simply discarded.
      if (seen.has(trait.id)) {
        throw new Error(game.i18n.format('STL.Traits.DuplicateId', { id: trait.id }));
      }
      seen.add(trait.id);
    }

    // Facets first, so a category saved alongside a brand-new race value sees it.
    for (const trait of this.traits) {
      if (!trait.id) continue;
      const entry = ensureOverlayFacet(draft, trait.id, trait.label || trait.id);
      entry.values = [...new Set(trait.values)];
    }

    const entry = ensureOverlayCategory(draft, id);
    entry.label = label || entry.label;
    entry.match.names = splitList(data.names);
    entry.match.creatureTypes = splitList(data.creatureTypes);

    await commit(draft);

    // Give a brand-new category somewhere for its art to land.
    if (this.isNew) await ensureDir(source(), artDir(id));

    log.log(`category "${id}" saved`);
    await this.browser?.refresh(id);
  }
}
