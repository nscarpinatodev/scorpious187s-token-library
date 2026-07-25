/**
 * Category and facet editor.
 *
 * Covers both "add new categories" and "add new races": a race is just a value
 * of the `race` facet, so one editor handles any trait dimension the GM wants
 * to filter on. Edits are made against a working copy of the overlay manifest
 * and only committed on save.
 */

import { MODULE_ID } from '../constants.js';
import {
  category, categories, facets as allFacets, draftOverlay, commit,
  ensureOverlayCategory, ensureOverlayFacet,
} from '../library/index.js';
import { ensureDir } from '../storage/files.js';
import { artDir, source, slugify } from '../storage/paths.js';
import { libApi } from '../integrations/lib.js';
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
    body: { template: `modules/${MODULE_ID}/templates/category-editor.hbs`, scrollable: [''] },
  };

  constructor(options = {}) {
    super(options);
    this.categoryId = options.categoryId ?? null;
    this.browser = options.browser ?? null;
  }

  /** @type {object|null} Working copy of the overlay manifest. */
  #draft = null;

  get draft() {
    this.#draft ??= draftOverlay();
    return this.#draft;
  }

  get isNew() {
    return !this.categoryId;
  }

  async _prepareContext() {
    const existing = this.categoryId ? category(this.categoryId) : null;

    // Seed the draft from the live facets the first time the editor opens, so
    // an existing library is editable rather than appearing empty.
    if (!this.draft.facets.length) {
      this.draft.facets = allFacets().map(f => ({ ...f, values: [...f.values] }));
    }

    return {
      isNew: this.isNew,
      categoryId: this.categoryId ?? '',
      label: existing?.label ?? '',
      names: (existing?.match.names ?? []).join(', '),
      creatureTypes: (existing?.match.creatureTypes ?? []).join(', '),
      imageCount: existing?.images.length ?? 0,
      readOnly: existing?.readOnly ?? false,
      facets: this.draft.facets.map(f => ({ ...f, valuesText: f.values.join(', ') })),
      knownCategories: categories().map(c => c.label).join(', '),
    };
  }

  /** Pull the form into the draft so re-renders do not lose typing. */
  #syncFromForm() {
    const form = this.element;
    if (!form) return;
    const data = foundry.utils.expandObject(new foundry.applications.ux.FormDataExtended(form).object);

    const rows = data.facets ?? {};
    this.draft.facets = Object.keys(rows)
      .sort((a, b) => Number(a) - Number(b))
      .map(index => {
        const row = rows[index];
        const id = slugify(row.id);
        if (!id) return null;
        return {
          id,
          label: String(row.label || id).trim(),
          values: splitList(row.values),
        };
      })
      .filter(Boolean);
  }

  static #onAddFacet() {
    this.#syncFromForm();
    this.draft.facets.push({ id: '', label: '', values: [] });
    this.render();
  }

  static #onAddFacetValue(event, target) {
    this.#syncFromForm();
    const facet = this.draft.facets[Number(target.dataset.index)];
    if (!facet) return;
    const input = this.element.querySelector(`[data-new-value="${target.dataset.index}"]`);
    const value = String(input?.value ?? '').trim();
    if (!value) return;
    if (!facet.values.includes(value)) facet.values.push(value);
    this.render();
  }

  static #onRemoveFacetValue(event, target) {
    this.#syncFromForm();
    const facet = this.draft.facets[Number(target.dataset.index)];
    if (!facet) return;
    facet.values = facet.values.filter(v => v !== target.dataset.value);
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

    this.#syncFromForm();
    const draft = this.draft;
    draft.categories = draft.categories.filter(c => c.id !== this.categoryId);
    await commit(draft);
    log.log(`category "${this.categoryId}" removed from the manifest (files left on disk)`);
    await this.browser?.refresh();
    this.close();
  }

  static async #onSubmit(event, form, formData) {
    this.#syncFromForm();
    const data = foundry.utils.expandObject(formData.object);
    const draft = this.draft;

    const label = String(data.label ?? '').trim();
    const id = this.categoryId ?? slugify(data.categoryId || label);
    if (!id) {
      ui.notifications?.error(game.i18n.localize('STL.Category.NeedName'));
      return;
    }

    // Facets first, so a category saved alongside a brand-new race value sees it.
    for (const facet of draft.facets) {
      const entry = ensureOverlayFacet(draft, facet.id, facet.label);
      entry.values = [...new Set(facet.values)];
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

/** Split a comma/newline separated field into trimmed, unique entries. */
function splitList(value) {
  return [...new Set(
    String(value ?? '')
      .split(/[,\n]/)
      .map(part => part.trim())
      .filter(Boolean),
  )];
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
