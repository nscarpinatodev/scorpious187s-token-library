/**
 * Adding images to the library.
 *
 * Two ways in:
 *   • drop or pick files, which get uploaded straight into `art/<category>/`;
 *   • point at images already sitting somewhere in the data directory.
 *
 * Either way the filenames are run through facet inference so the new art is
 * immediately filterable, and any unrecognised words are offered as new facet
 * values — that is how a GM grows the race list without opening JSON.
 */

import { MODULE_ID, DIRS } from '../constants.js';
import {
  category, facets as allFacets, draftOverlay, commit,
  ensureOverlayCategory, ensureOverlayFacet,
} from '../library/index.js';
import { inferFacets, unknownTokens } from '../library/infer.js';
import { uploadBlob, ensureDir } from '../storage/files.js';
import { artDir, source, basename, join } from '../storage/paths.js';
import { available as tokenizerAvailable } from '../integrations/tokenizer2.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class ImportDialog extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-import',
    tag: 'form',
    classes: ['stl', 'stl-window', 'stl-import'],
    window: { title: 'STL.Import.Title', icon: 'fas fa-file-import', resizable: true },
    position: { width: 620, height: 'auto' },
    form: { handler: ImportDialog.#onSubmit, closeOnSubmit: false, submitOnChange: false },
    actions: {
      pickFiles:   ImportDialog.#onPickFiles,
      browseData:  ImportDialog.#onBrowseData,
      removeFile:  ImportDialog.#onRemoveFile,
      toggleToken: ImportDialog.#onToggleToken,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/import-dialog.hbs`, scrollable: [''] },
  };

  constructor(options = {}) {
    super(options);
    this.categoryId = options.categoryId ?? null;
    this.browser = options.browser ?? null;
  }

  /** @type {Array<{name: string, file: File|null, path: string|null}>} */
  #queue = [];
  /** Facet values the GM has opted to create from unrecognised filename words. */
  #acceptedTokens = new Set();
  /** Which facet each accepted token should join. */
  #tokenFacet = new Map();
  #busy = false;

  async _prepareContext() {
    const cat = this.categoryId ? category(this.categoryId) : null;
    const names = this.#queue.map(entry => entry.name);
    const facets = allFacets();

    const suggestions = unknownTokens(names, facets, [cat?.label ?? '', this.categoryId ?? ''])
      .slice(0, 24)
      .map(token => ({
        token,
        accepted: this.#acceptedTokens.has(token),
        facetId: this.#tokenFacet.get(token) ?? facets[0]?.id ?? '',
      }));

    return {
      categoryId: this.categoryId,
      categoryLabel: cat?.label ?? this.categoryId ?? '',
      targetDir: this.categoryId ? artDir(this.categoryId) : '',
      queue: this.#queue.map((entry, index) => ({
        index,
        name: entry.name,
        fromDisk: !!entry.path,
        facets: Object.entries(inferFacets(entry.name, facets))
          .map(([, value]) => value).join(' · '),
      })),
      hasQueue: this.#queue.length > 0,
      facets,
      suggestions,
      hasSuggestions: suggestions.length > 0,
      tokenizer: tokenizerAvailable(),
      busy: this.#busy,
    };
  }

  _onRender(context, options) {
    super._onRender?.(context, options);
    const drop = this.element.querySelector('.stl-dropzone');
    if (!drop) return;

    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('active');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('active'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('active');
      this.#enqueueFiles([...(event.dataTransfer?.files ?? [])]);
    });
  }

  #enqueueFiles(files) {
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      if (this.#queue.some(entry => entry.name === file.name)) continue;
      this.#queue.push({ name: file.name, file, path: null });
    }
    this.render();
  }

  static #onPickFiles() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.addEventListener('change', () => this.#enqueueFiles([...input.files]));
    input.click();
  }

  /** Add images that already live in the data directory, without re-uploading. */
  static async #onBrowseData() {
    const FilePicker = foundry.applications?.apps?.FilePicker?.implementation ?? globalThis.FilePicker;
    new FilePicker({
      type: 'image',
      callback: (path) => {
        if (!this.#queue.some(entry => entry.path === path)) {
          this.#queue.push({ name: basename(path), file: null, path });
        }
        this.render();
      },
    }).render(true);
  }

  static #onRemoveFile(event, target) {
    this.#queue.splice(Number(target.dataset.index), 1);
    this.render();
  }

  static #onToggleToken(event, target) {
    const token = target.dataset.token;
    if (this.#acceptedTokens.has(token)) this.#acceptedTokens.delete(token);
    else this.#acceptedTokens.add(token);
    this.render();
  }

  static async #onSubmit(event, form, formData) {
    if (this.#busy) return;
    if (!this.categoryId) {
      ui.notifications?.error(game.i18n.localize('STL.Import.NeedCategory'));
      return;
    }
    if (!this.#queue.length) {
      ui.notifications?.warn(game.i18n.localize('STL.Import.NothingQueued'));
      return;
    }

    const data = foundry.utils.expandObject(formData.object);
    // Remember which facet each accepted suggestion belongs to.
    for (const [token, facetId] of Object.entries(data.tokenFacet ?? {})) {
      this.#tokenFacet.set(token, facetId);
    }

    this.#busy = true;
    this.render();

    try {
      const draft = draftOverlay();

      // New facet values first, so inference below can see them.
      for (const token of this.#acceptedTokens) {
        const facetId = this.#tokenFacet.get(token) ?? allFacets()[0]?.id;
        if (!facetId) continue;
        const facet = ensureOverlayFacet(draft, facetId);
        if (!facet.values.includes(token)) facet.values.push(token);
      }

      const dir = artDir(this.categoryId);
      await ensureDir(source(), dir);

      const entry = ensureOverlayCategory(draft, this.categoryId);
      const facetDefs = mergeFacetDefs(allFacets(), draft.facets);
      let added = 0;

      for (const item of this.#queue) {
        let storedPath = item.path;

        if (item.file) {
          storedPath = await uploadBlob(source(), dir, item.file.name, item.file);
          if (!storedPath) {
            log.warn(`could not upload ${item.file.name}`);
            continue;
          }
        }

        const location = describeLocation(storedPath, this.categoryId);
        if (entry.images.some(image => image.file === location.file)) continue;

        entry.images.push({
          ...location,
          facets: inferFacets(basename(storedPath), facetDefs),
        });
        added++;
      }

      await commit(draft);
      this.#queue = [];
      this.#acceptedTokens.clear();

      ui.notifications?.info(game.i18n.format('STL.Import.Added', { count: added }));
      log.log(`imported ${added} image(s) into "${this.categoryId}"`);
      await this.browser?.refresh(this.categoryId);
      this.close();
    } finally {
      this.#busy = false;
    }
  }
}

/**
 * Manifest `file` entries are normally relative to the library root. Art the GM
 * linked from elsewhere in the data directory has no meaningful relative form,
 * so it is stored absolute and flagged `external` — guessing from the path
 * shape would break the moment someone names a folder "art".
 */
function describeLocation(storedPath, categoryId) {
  const dir = artDir(categoryId);
  if (storedPath.startsWith(`${dir}/`)) {
    return { file: join(DIRS.ART, categoryId, basename(storedPath)), external: false };
  }
  return { file: storedPath, external: true };
}

/** Union of the live facets and any the draft just introduced. */
function mergeFacetDefs(live, drafted) {
  const merged = new Map(live.map(f => [f.id, { ...f, values: [...f.values] }]));
  for (const facet of drafted) {
    const existing = merged.get(facet.id);
    if (!existing) merged.set(facet.id, { ...facet, values: [...facet.values] });
    else for (const value of facet.values) {
      if (!existing.values.includes(value)) existing.values.push(value);
    }
  }
  return [...merged.values()];
}
