/**
 * The token library browser.
 *
 * Category list on the left, facet filter chips and a thumbnail grid on the
 * right. This is the primary way art gets applied; the auto-apply hook only
 * covers actors nobody has configured here.
 *
 * The grid renders in pages because a single category can legitimately hold
 * hundreds of images, and putting all of them in the DOM at once makes the
 * window crawl.
 */

import { MODULE_ID, RING_MODES } from '../constants.js';
import {
  categories, category, facetsFor, images as libraryImages, imageCount, isBuilt, build,
} from '../library/index.js';
import { savedSelection } from '../library/matching.js';
import { applyToActor, applyToTokens, ringMode } from '../ring/apply.js';
import { pendingBakes, frameSrc } from '../ring/bake.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How many thumbnails to add each time the grid grows. */
const PAGE_SIZE = 120;

export class TokenLibraryBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-browser',
    classes: ['stl', 'stl-window', 'stl-browser'],
    window: { title: 'STL.Browser.Title', icon: 'fas fa-images', resizable: true },
    position: { width: 980, height: 700 },
    actions: {
      selectCategory:  TokenLibraryBrowser.#onSelectCategory,
      toggleFacet:     TokenLibraryBrowser.#onToggleFacet,
      clearFilters:    TokenLibraryBrowser.#onClearFilters,
      selectImage:     TokenLibraryBrowser.#onSelectImage,
      applyToTokens:   TokenLibraryBrowser.#onApplyToTokens,
      applyToActor:    TokenLibraryBrowser.#onApplyToActor,
      loadMore:        TokenLibraryBrowser.#onLoadMore,
      bakeSet:         TokenLibraryBrowser.#onBakeSet,
      addImages:       TokenLibraryBrowser.#onAddImages,
      addCategory:     TokenLibraryBrowser.#onAddCategory,
      editCategory:    TokenLibraryBrowser.#onEditCategory,
      refresh:         TokenLibraryBrowser.#onRefresh,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/browser.hbs`, scrollable: ['.stl-grid', '.stl-categories'] },
  };

  /** @param {object} [options] @param {Actor} [options.actor] Pre-target an actor. */
  constructor(options = {}) {
    super(options);
    this.actor = options.actor ?? null;
  }

  /** @type {string|null} */
  #categoryId = null;
  /** @type {Record<string, string[]>} */
  #filter = {};
  /** @type {string|null} Pinned image path. */
  #selected = null;
  #visible = PAGE_SIZE;

  get categoryId() {
    if (this.#categoryId && category(this.#categoryId)) return this.#categoryId;
    this.#categoryId = this.#initialCategory();
    return this.#categoryId;
  }

  /** Open on the targeted actor's saved or matched category when we have one. */
  #initialCategory() {
    if (this.actor) {
      const saved = savedSelection(this.actor);
      if (saved && category(saved.categoryId)) {
        this.#filter = foundry.utils.deepClone(saved.facets ?? {});
        this.#selected = saved.file ?? null;
        return saved.categoryId;
      }
    }
    return categories()[0]?.id ?? null;
  }

  /** The images the current category + filter select. */
  get matches() {
    return this.categoryId ? libraryImages(this.categoryId, this.#filter) : [];
  }

  async _prepareContext() {
    if (!isBuilt()) await build();

    const active = this.categoryId ? category(this.categoryId) : null;
    const matches = this.matches;
    const shown = matches.slice(0, this.#visible);
    const mode = ringMode();

    return {
      isGM: game.user.isGM,
      actor: this.actor,
      totalImages: imageCount(),
      categories: categories().map(c => ({
        id: c.id,
        label: c.label,
        count: c.images.length,
        active: c.id === this.categoryId,
        readOnly: c.readOnly,
      })),
      category: active,
      facets: facetsFor(this.categoryId).map(f => ({
        id: f.id,
        label: f.label,
        values: f.values.map(value => ({
          value,
          selected: (this.#filter[f.id] ?? []).includes(value),
        })),
      })),
      hasFilter: Object.values(this.#filter).some(v => v?.length),
      images: shown.map(image => ({
        path: image.path,
        filename: image.filename,
        tooltip: describeImage(image),
        selected: image.path === this.#selected,
        readOnly: image.readOnly,
      })),
      matchCount: matches.length,
      shownCount: shown.length,
      hasMore: matches.length > shown.length,
      mode,
      modeLabel: game.i18n.localize(
        mode === RING_MODES.FRAME ? 'STL.Settings.RingModeFrame' : 'STL.Settings.RingModeDynamic',
      ),
      frameName: frameSrc().split('/').pop() ?? '',
      needsFrame: mode === RING_MODES.FRAME && !frameSrc(),
      selectedTokens: canvas?.tokens?.controlled?.length ?? 0,
    };
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  static #onSelectCategory(event, target) {
    this.#categoryId = target.dataset.categoryId;
    this.#filter = {};
    this.#selected = null;
    this.#visible = PAGE_SIZE;
    this.render();
  }

  static #onToggleFacet(event, target) {
    const { facetId, value } = target.dataset;
    const current = new Set(this.#filter[facetId] ?? []);
    if (current.has(value)) current.delete(value);
    else current.add(value);
    if (current.size) this.#filter[facetId] = [...current];
    else delete this.#filter[facetId];
    this.#visible = PAGE_SIZE;
    this.render();
  }

  static #onClearFilters() {
    this.#filter = {};
    this.#visible = PAGE_SIZE;
    this.render();
  }

  static #onSelectImage(event, target) {
    const path = target.dataset.path;
    this.#selected = this.#selected === path ? null : path;
    this.render();
  }

  static #onLoadMore() {
    this.#visible += PAGE_SIZE;
    this.render();
  }

  static async #onApplyToTokens() {
    const controlled = canvas?.tokens?.controlled ?? [];
    if (!controlled.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.NoTokensSelected'));
      return;
    }
    const pool = this.matches;
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.EmptySelection'));
      return;
    }
    const pinned = this.#selected ? pool.find(i => i.path === this.#selected) : null;

    await applyToTokens(
      controlled.map(t => t.document),
      pinned ?? pool[0],
      { varyPerToken: !pinned, pool },
    );
    ui.notifications?.info(game.i18n.format('STL.Info.AppliedToTokens', { count: controlled.length }));
  }

  static async #onApplyToActor() {
    const actor = this.actor ?? canvas?.tokens?.controlled?.[0]?.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.NoActor'));
      return;
    }
    await applyToActor(actor, {
      categoryId: this.categoryId,
      facets: this.#filter,
      file: this.#selected,
    });
    ui.notifications?.info(game.i18n.format('STL.Info.AppliedToActor', { name: actor.name }));
    this.render();
  }

  static async #onBakeSet() {
    const { BakeProgress } = await import('./bake-progress.js');
    const pool = this.matches;
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.EmptySelection'));
      return;
    }
    const pending = await pendingBakes(pool);
    if (!pending.length) {
      ui.notifications?.info(game.i18n.localize('STL.Info.AlreadyBaked'));
      return;
    }
    // The progress window drives the run itself; refresh once it closes so the
    // "Bake Set" state reflects reality.
    const progress = new BakeProgress({ images: pool });
    Hooks.once('closeBakeProgress', () => this.render());
    progress.render(true);
  }

  static async #onAddImages() {
    const { ImportDialog } = await import('./import-dialog.js');
    new ImportDialog({ categoryId: this.categoryId, browser: this }).render(true);
  }

  static async #onAddCategory() {
    const { CategoryEditor } = await import('./category-editor.js');
    new CategoryEditor({ browser: this }).render(true);
  }

  static async #onEditCategory() {
    const { CategoryEditor } = await import('./category-editor.js');
    new CategoryEditor({ categoryId: this.categoryId, browser: this }).render(true);
  }

  static async #onRefresh() {
    await build();
    this.render();
  }

  /** Called by the editors once they have committed a change. */
  async refresh(categoryId = null) {
    if (categoryId) this.#categoryId = categoryId;
    this.#visible = PAGE_SIZE;
    this.render();
  }
}

/** Human-readable facet summary for a thumbnail tooltip. */
function describeImage(image) {
  const parts = Object.entries(image.facets).map(([, value]) => value);
  return parts.length ? `${image.filename}\n${parts.join(' · ')}` : image.filename;
}

/** Singleton-ish opener so the browser does not stack up. */
let instance = null;

export function openBrowser(options = {}) {
  if (instance?.rendered) {
    instance.actor = options.actor ?? instance.actor;
    instance.render(true);
    return instance;
  }
  instance = new TokenLibraryBrowser(options);
  instance.render(true);
  log.debug('browser opened');
  return instance;
}
