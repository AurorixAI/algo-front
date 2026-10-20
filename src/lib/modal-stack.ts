/**
 * The stack of open dialogs (the shared `Modal` and the bottom sheet «Ещё»).
 *
 * Why it exists: every open dialog used to listen to the keyboard on its own, so with a confirmation opened over a form
 * one Escape closed both, and Tab was trapped by two dialogs at once.  Now ONE listener on the document hands the key
 * to the TOPMOST dialog only; the dialogs below it ignore the keyboard until they are on top again.  One listener (not
 * one per dialog) is deliberate: React may commit the top dialog's closing between two listeners of the same key press,
 * and the dialog below would then see itself as the new top and close with the same Escape.
 *
 * The stack takes its host (where keys come from) as a parameter, so the order rules are testable without a browser.
 */

export type KeyHandler<E> = (event: E) => void;

export interface KeyHost<E> {
  /** Start listening; returns the function that stops. */
  listen(handler: KeyHandler<E>): () => void;
}

export interface LayerHandle {
  /** Take this layer off the stack, wherever it is (idempotent); the layers below keep their order. */
  remove(): void;
}

export interface LayerStack<E> {
  /** Put a layer on top. */
  push(layer: KeyHandler<E>): LayerHandle;
  /** How many layers are open. */
  size(): number;
}

export function createLayerStack<E>(host: KeyHost<E>): LayerStack<E> {
  const layers: Array<{ handle: KeyHandler<E> }> = [];
  let stop: (() => void) | null = null;
  const dispatch: KeyHandler<E> = (event) => {
    const top = layers[layers.length - 1];
    if (top) top.handle(event);
  };
  return {
    push(layer) {
      const entry = { handle: layer };
      layers.push(entry);
      if (!stop) stop = host.listen(dispatch);
      return {
        remove() {
          const index = layers.indexOf(entry);
          if (index < 0) return;
          layers.splice(index, 1);
          if (layers.length === 0 && stop) {
            stop();
            stop = null;
          }
        },
      };
    },
    size: () => layers.length,
  };
}

/** The keyboard host of the browser: the document, `keydown`. */
const browserHost: KeyHost<KeyboardEvent> = {
  listen(handler) {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  },
};

/** The dialogs of this page. */
export const dialogLayers: LayerStack<KeyboardEvent> = createLayerStack(browserHost);

// ── What the topmost dialog does with a key ────────────────────────────────────────────────────────

export const FOCUSABLE = 'a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])';

export interface DialogKeyState {
  /** While true Escape does not close (a request is running). */
  busy: boolean;
  onClose: () => void;
}

/** The controls Tab may reach inside the dialog: visible, enabled, not hidden from assistive tech. */
export function tabbableIn(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true" && el.offsetParent !== null,
  );
}

/** Escape closes the dialog; Tab and Shift+Tab stay inside it.  Called for the topmost dialog only. */
export function handleDialogKey(event: KeyboardEvent, dialog: HTMLElement | null, state: DialogKeyState): void {
  if (event.key === "Escape" && !state.busy) {
    state.onClose();
    return;
  }
  if (event.key !== "Tab" || !dialog) return;
  const items = tabbableIn(dialog);
  if (items.length === 0) {
    event.preventDefault();
    dialog.focus();
    return;
  }
  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement as HTMLElement | null;
  if (!active || !dialog.contains(active)) {
    event.preventDefault();
    first.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}
