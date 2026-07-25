/**
 * The token library browser.
 *
 * Category list on the left, trait filter chips and a thumbnail grid on the
 * right. This is the primary way art gets applied; the auto-apply hook only
 * covers actors nobody has configured here.
 *
 * The grid renders in pages because a single category can legitimately hold
 * hundreds of images, and putting all of them in the DOM at once makes the
 * window crawl.
 *
 * Thumbnails are multi-select: one selection drives both "pin this exact image"
 * and "tag these images with a trait", which is the only practical way to make
 * bulk-imported art filterable when its filenames say nothing useful.
 */

import { MODULE_ID, RING_MODES, SETTINGS } from '../constants.js';
import { get } from '../settings.js';
import {
  categories, category, facets as allFacets, facetsFor, images as libraryImages,
  imageCount, isBuilt, build, setImageFacets,
} from '../library/index.js';
import { savedSelection } from '../library/matching.js';
import { applyToActor, applyToTokens, ringMode, resolveActorTarget } from '../ring/apply.js';
import { pendingBakes, currentVariant, needsProcessing } from '../ring/bake.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How many thumbnails to add each time the grid grows. */
const PAGE_SIZE = 120;

export class TokenLibraryBrowser extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-browser',
    classes: ['stl', 'stl-window', 'stl-browser'],
    window: { title: 'STL.Browser.Title', icon: 'fas fa-images', resizable: true },
    position: { width: 1120, height: 780 },
    actions: {
      selectCategory:  TokenLibraryBrowser.#onSelectCategory,
      toggleFacet:     TokenLibraryBrowser.#onToggleFacet,
      clearFilters:    TokenLibraryBrowser.#onClearFilters,
      selectImage:     TokenLibraryBrowser.#onSelectImage,
      selectAll:       TokenLibraryBrowser.#onSelectAll,
      clearSelection:  TokenLibraryBrowser.#onClearSelection,
      applyTags:       TokenLibraryBrowser.#onApplyTags,
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
  /** @type {Set<string>} Selected image paths. */
  #selection = new Set();
  #visible = PAGE_SIZE;

  get categoryId() {
    if (this.#categoryId && category(this.#categoryId)) return this.#categoryId;
    this.#categoryId = this.#initialCategory();
    return this.#categoryId;
  }

  /** Open on the targeted actor's saved category when it has one. */
  #initialCategory() {
    if (this.actor) {
      const { worldActor } = resolveActorTarget(this.actor);
      const saved = savedSelection(worldActor);
      if (saved && category(saved.categoryId)) {
        this.#filter = foundry.utils.deepClone(saved.facets ?? {});
        if (saved.file) this.#selection = new Set([saved.file]);
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
    const variant = currentVariant();
    const untagged = active ? active.images.filter(i => !Object.keys(i.facets).length).length : 0;

    return {
      isGM: game.user.isGM,
      actor: this.actor,
      totalImages: imageCount(),
      thumbSize: Number(get(SETTINGS.THUMBNAIL_SIZE)) || 256,
      categories: categories().map(c => ({
        id: c.id,
        label: c.label,
        count: c.images.length,
        active: c.id === this.categoryId,
        readOnly: c.readOnly,
      })),
      category: active,
      untagged,
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
        selected: this.#selection.has(image.path),
        readOnly: image.readOnly,
        untagged: !Object.keys(image.facets).length,
      })),
      matchCount: matches.length,
      shownCount: shown.length,
      hasMore: matches.length > shown.length,
      selectedCount: this.#selection.size,
      // The tag panel offers every trait defined anywhere, not just the ones
      // already present here — otherwise a category of untagged art could never
      // get its first trait.
      tagFacets: allFacets().map(f => ({ id: f.id, label: f.label, values: f.values })),
      hasTagFacets: allFacets().length > 0,
      mode,
      modeLabel: game.i18n.localize(
        mode === RING_MODES.FRAME ? 'STL.Settings.RingModeFrame' : 'STL.Settings.RingModeDynamic',
      ),
      variantLabel: variant?.label ?? '',
      needsProcessing: needsProcessing(),
      needsFrame: mode === RING_MODES.FRAME && !variant,
      selectedTokens: canvas?.tokens?.controlled?.length ?? 0,
    };
  }

  /** Drive the grid's track size from the setting. */
  _onRender(context, options) {
    super._onRender?.(context, options);
    this.element.style.setProperty('--stl-thumb-size', `${context.thumbSize}px`);
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  static #onSelectCategory(event, target) {
    this.#categoryId = target.dataset.categoryId;
    this.#filter = {};
    this.#selection.clear();
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
    // Plain click selects just this one; ctrl/shift extends, for bulk tagging.
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      if (this.#selection.has(path)) this.#selection.delete(path);
      else this.#selection.add(path);
    } else if (this.#selection.size === 1 && this.#selection.has(path)) {
      this.#selection.clear();
    } else {
      this.#selection = new Set([path]);
    }
    this.render();
  }

  static #onSelectAll() {
    this.#selection = new Set(this.matches.map(i => i.path));
    this.render();
  }

  static #onClearSelection() {
    this.#selection.clear();
    this.render();
  }

  /** Write the tag panel's trait values onto the selected images. */
  static async #onApplyTags() {
    if (!this.#selection.size) return;

    const assignments = {};
    for (const select of this.element.querySelectorAll('[data-tag-facet]')) {
      const value = select.value;
      if (value === '__keep__') continue;      // leave this trait alone
      assignments[select.dataset.tagFacet] = value === '__clear__' ? '' : value;
    }

    if (!Object.keys(assignments).length) {
      ui.notifications?.warn(game.i18n.localize('STL.Tag.NothingChosen'));
      return;
    }

    const paths = [...this.#selection];
    await setImageFacets(this.categoryId, paths, assignments);
    ui.notifications?.info(game.i18n.format('STL.Tag.Applied', { count: paths.length }));
    log.log(`tagged ${paths.length} image(s) in "${this.categoryId}"`);
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
    const pool = this.#applyPool();
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.EmptySelection'));
      return;
    }

    await applyToTokens(
      controlled.map(t => t.document),
      pool[0],
      { varyPerToken: pool.length > 1, pool },
    );
    ui.notifications?.info(game.i18n.format('STL.Info.AppliedToTokens', { count: controlled.length }));
  }

  static async #onApplyToActor() {
    const actor = this.actor ?? canvas?.tokens?.controlled?.[0]?.actor;
    if (!actor) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.NoActor'));
      return;
    }

    const result = await applyToActor(actor, {
      categoryId: this.categoryId,
      facets: this.#filter,
      file: this.#pinnedFile(),
    });
    if (!result) return;

    const { worldActor } = resolveActorTarget(actor);
    ui.notifications?.info(result.touched
      ? game.i18n.format('STL.Info.AppliedToActorAndTokens', { name: worldActor.name, count: result.touched })
      : game.i18n.format('STL.Info.AppliedToActor', { name: worldActor.name }));
    this.render();
  }

  /** Exactly one selected image means "pin this"; anything else means "the set". */
  #pinnedFile() {
    return this.#selection.size === 1 ? [...this.#selection][0] : null;
  }

  /** What a token apply should draw from: the explicit selection, else the filter. */
  #applyPool() {
    if (this.#selection.size) {
      const chosen = new Set(this.#selection);
      return this.matches.filter(i => chosen.has(i.path));
    }
    return this.matches;
  }

  static async #onBakeSet() {
    const { BakeProgress } = await import('./bake-progress.js');
    const pool = this.matches;
    if (!pool.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Warn.EmptySelection'));
      return;
    }
    if (!needsProcessing()) {
      ui.notifications?.info(game.i18n.localize('STL.Info.NoProcessingNeeded'));
      return;
    }
    const pending = await pendingBakes(pool);
    if (!pending.length) {
      ui.notifications?.info(game.i18n.localize('STL.Info.AlreadyBaked'));
      return;
    }
    // The progress window drives the run itself; refresh once it closes so the
    // "Process Set" state reflects reality.
    Hooks.once('closeBakeProgress', () => this.render());
    new BakeProgress({ images: pool }).render(true);
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

/** Human-readable trait summary for a thumbnail tooltip. */
function describeImage(image) {
  const parts = Object.values(image.facets);
  return parts.length ? `${image.filename}\n${parts.join(' · ')}` : image.filename;
}

// ── Opening ──────────────────────────────────────────────────────────────────

/** @type {TokenLibraryBrowser|null} */
let instance = null;
/** Guards against a second open landing while the first render is still async. */
let opening = false;

export function openBrowser(options = {}) {
  if (instance?.rendered) {
    if (options.actor) instance.actor = options.actor;
    instance.render(true);
    return instance;
  }
  // Two apps sharing one DOM id detach each other's element mid-render, which
  // surfaces as a null parentElement inside _updatePosition.
  if (opening) return instance;

  opening = true;
  instance = new TokenLibraryBrowser(options);
  Promise.resolve(instance.render(true)).finally(() => { opening = false; });
  log.debug('browser opened');
  return instance;
}
