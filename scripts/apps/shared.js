/**
 * Small pieces the windows share.
 */

/**
 * Apps this module opened, by DOM id, so a second request focuses the first.
 *
 * Foundry keys windows by id, and a second app with the same id replaces the
 * first one's element mid-flight — the same failure openBrowser() guards
 * against. foundry.applications.instances is not enough on its own: an app is
 * only registered there once its first render finishes, so a double-click
 * lands before it is.
 * @type {Map<string, foundry.applications.api.ApplicationV2>}
 */
const opened = new Map();

/**
 * Open an app, or bring forward the one already open under the same id.
 * @param {typeof foundry.applications.api.ApplicationV2} AppClass
 * @param {object} [options] Constructor options; `id` overrides the class default.
 */
export function openOnce(AppClass, options = {}) {
  const id = options.id ?? AppClass.DEFAULT_OPTIONS.id;
  const { CLOSED } = foundry.applications.api.ApplicationV2.RENDER_STATES;

  const existing = opened.get(id);
  if (existing && existing.state > CLOSED) {
    existing.render({ force: true });
    return existing;
  }

  const app = new AppClass({ ...options, id });
  opened.set(id, app);
  app.render({ force: true });
  return app;
}

/** Split a comma/newline separated field into trimmed, unique entries. */
export function splitList(value) {
  return [...new Set(
    String(value ?? '')
      .split(/[,\n]/)
      .map(part => part.trim())
      .filter(Boolean),
  )];
}

/**
 * Make Enter in a "new value" box mean "add", not "submit".
 *
 * The editors are forms, so Enter in any text field submits — which saved and
 * closed the window and dropped the value being typed, since the box is not a
 * named field. Each box sits beside its own add button, so Enter clicks that.
 * @param {HTMLElement} root
 */
export function bindValueInputs(root) {
  for (const input of root.querySelectorAll('[data-new-value]')) {
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.isComposing) return;
      event.preventDefault();
      input.parentElement?.querySelector('button[data-action]')?.click();
    });
  }
}

/**
 * Whatever is still sitting in the "new value" boxes, by row index.
 *
 * Typing a value and pressing Save is a reasonable thing to do; it should keep
 * the value rather than quietly discard it for want of an Add click.
 * @param {HTMLElement} root
 * @returns {Map<number, string[]>}
 */
export function pendingValues(root) {
  const pending = new Map();
  for (const input of root?.querySelectorAll('[data-new-value]') ?? []) {
    const values = splitList(input.value);
    if (values.length) pending.set(Number(input.dataset.newValue), values);
  }
  return pending;
}
