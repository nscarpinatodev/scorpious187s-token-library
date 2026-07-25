/**
 * Bake progress window.
 *
 * Baking is one canvas composite plus one upload per image, so a large category
 * takes real time. The window stays open with a live count and a working cancel
 * button rather than freezing the UI behind a spinner.
 */

import { MODULE_ID } from '../constants.js';
import { bakeImages, currentVariant } from '../ring/bake.js';
import { log } from '../logger.js';

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class BakeProgress extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: 'stl-bake-progress',
    classes: ['stl', 'stl-window', 'stl-bake'],
    window: { title: 'STL.Bake.Title', icon: 'fas fa-fire', resizable: false },
    position: { width: 460, height: 'auto' },
    actions: {
      cancel: BakeProgress.#onCancel,
      close:  BakeProgress.#onClose,
    },
  };

  static PARTS = {
    body: { template: `modules/${MODULE_ID}/templates/bake-progress.hbs` },
  };

  constructor(options = {}) {
    super(options);
    this.images = options.images ?? [];
  }

  #done = 0;
  #total = 0;
  #current = '';
  #cancelled = false;
  #finished = false;
  #result = null;

  async _prepareContext() {
    return {
      frame: currentVariant()?.label ?? '',
      done: this.#done,
      total: this.#total || this.images.length,
      percent: this.#total ? Math.round((this.#done / this.#total) * 100) : 0,
      current: this.#current,
      finished: this.#finished,
      cancelled: this.#cancelled,
      baked: this.#result?.baked.length ?? 0,
      skipped: this.#result?.skipped ?? 0,
      failed: this.#result?.failed.length ?? 0,
    };
  }

  async _onRender(context, options) {
    await super._onRender?.(context, options);
    // Kick the run off once, after the first paint.
    if (this.#total === 0 && !this.#finished) this.#run();
  }

  async #run() {
    this.#total = this.images.length;
    try {
      this.#result = await bakeImages(this.images, {
        shouldStop: () => this.#cancelled,
        onProgress: (done, total, image) => {
          this.#done = done;
          this.#total = total;
          this.#current = image.filename;
          this.render();
        },
      });
    } catch (err) {
      log.error('bake run failed:', err);
      ui.notifications?.error(game.i18n.format('STL.Bake.Failed', { error: String(err?.message ?? err) }));
    } finally {
      this.#finished = true;
      this.render();
    }
  }

  static #onCancel() {
    this.#cancelled = true;
    this.render();
  }

  static #onClose() {
    this.close();
  }
}
