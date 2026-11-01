import { useEffect, useRef } from "react";
import { askConfirm } from "./confirm-dialog";

/** What the guard needs of the browser: injected, so a test can drive it with a fake history. */
export interface GuardEnv {
  window: {
    history: {
      readonly state: unknown;
      pushState(state: unknown, unused: string, url?: string | null): void;
      back(): void;
    };
    location: { readonly href: string; readonly pathname: string; readonly search: string; readonly origin: string };
    /** The question «leave the page?»: the platform's dialog (WB-P5, F-A20), never the browser's `confirm`. */
    ask(message: string): Promise<boolean>;
    addEventListener(type: string, listener: (event: never) => void): void;
    removeEventListener(type: string, listener: (event: never) => void): void;
  };
  document: {
    addEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
    removeEventListener(type: string, listener: (event: never) => void, capture?: boolean): void;
  };
}

export interface UnsavedGuard {
  /** The page became dirty or clean. */
  update(dirty: boolean): void;
  /** The page is gone: the listeners are removed (the history is left as it is). */
  dispose(): void;
}

/** The link the click was on: `click()` repeats the click once the user has said «Уйти». */
interface AnchorLike {
  href: string;
  target?: string;
  hasAttribute(name: string): boolean;
  click?(): void;
}

interface ClickLike {
  defaultPrevented: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  target: unknown;
  preventDefault(): void;
  stopPropagation(): void;
}

/**
 * Asks before the user leaves a page with unsaved edits.  Three ways out are covered:
 * - closing / reloading the tab and typing another address: the browser's own question (`beforeunload`);
 * - a click on any link to another page of the app (the menu, «Назад»): the click is stopped before the router sees it,
 *   the platform's dialog asks, and «Уйти» repeats the click on the same link (the repeat passes through);
 * - the browser's Back button: while the page is dirty one extra history entry (the sentinel) sits above it, so
 *   Back lands on the same address first and the question is asked there (a router cannot cancel a Back itself).
 * The question is asked by a dialog of the page, so the answer arrives later: nothing here waits for it synchronously.
 * The sentinel lives only as long as the page is dirty: once the page is clean again (saved, edits discarded) it is
 * taken off with one `history.back()` whose popstate is swallowed, so Back then goes back in one press; when the
 * page becomes dirty again it is pushed again.  A link that stays on the same page (a tab, an anchor) is not a way
 * out.  Buttons that navigate through the router must ask for themselves (`confirmLeave`).
 */
export function createUnsavedGuard(env: GuardEnv, getMessage: () => string): UnsavedGuard {
  const win = env.window;
  let dirty = false;
  /** Our extra history entry is the top of the stack. */
  let sentinel = false;
  /** The popstate of our own `history.back()` that takes the sentinel off is on its way: nobody is asked about it. */
  let swallowing = false;
  /** The page became dirty while that back was still on its way: the sentinel is pushed when it has landed. */
  let pushAfterSwallow = false;
  let leaving = false;
  let listening = false;
  /** The question is on screen: a second Back or click does not stack another one. */
  let asking = false;
  /** The repeat of a click the user has allowed is on its way through the listener. */
  let repeating = false;

  const pushSentinel = () => {
    win.history.pushState(win.history.state, "", win.location.href);
    sentinel = true;
  };

  const onBeforeUnload = (event: { preventDefault(): void; returnValue?: unknown }) => {
    if (leaving) return;
    event.preventDefault();
    event.returnValue = "";
  };

  const onClick = (event: ClickLike) => {
    if (repeating) return;
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as { closest?: (selector: string) => unknown } | null;
    const anchor = (target && typeof target.closest === "function" ? target.closest("a[href]") : null) as AnchorLike | null;
    if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
    let url: URL;
    try {
      url = new URL(anchor.href, win.location.href);
    } catch {
      return;
    }
    // Another site is covered by beforeunload; the same page (a tab, an anchor) is not a way out.
    if (url.origin !== win.location.origin) return;
    if (url.pathname === win.location.pathname && url.search === win.location.search) return;
    // The router must not see this click before the user has answered.
    event.preventDefault();
    event.stopPropagation();
    if (asking) return;
    asking = true;
    void win.ask(getMessage()).then((leave) => {
      asking = false;
      if (!leave || !anchor.click) return;
      repeating = true;
      try {
        anchor.click();
      } finally {
        repeating = false;
      }
    });
  };

  const onPopState = () => {
    if (swallowing) {
      // Our own back: the sentinel is off the stack.
      swallowing = false;
      if (pushAfterSwallow) {
        pushAfterSwallow = false;
        if (dirty) pushSentinel();
      }
      return;
    }
    if (leaving || !dirty) return;
    // The user's Back took the sentinel off: we stand on the page itself.
    sentinel = false;
    if (asking) return;
    asking = true;
    void win.ask(getMessage()).then((leave) => {
      asking = false;
      if (leave) {
        leaving = true;
        win.history.back();
      } else if (dirty && !sentinel) {
        pushSentinel();
      }
    });
  };

  win.addEventListener("popstate", onPopState);

  const listen = () => {
    if (listening) return;
    listening = true;
    win.addEventListener("beforeunload", onBeforeUnload);
    env.document.addEventListener("click", onClick, true);
  };
  const unlisten = () => {
    if (!listening) return;
    listening = false;
    win.removeEventListener("beforeunload", onBeforeUnload);
    env.document.removeEventListener("click", onClick, true);
  };

  return {
    update(next) {
      if (next === dirty) return;
      dirty = next;
      if (dirty) {
        listen();
        if (swallowing) pushAfterSwallow = true;
        else if (!sentinel) pushSentinel();
      } else {
        unlisten();
        pushAfterSwallow = false;
        if (sentinel) {
          sentinel = false;
          swallowing = true;
          win.history.back();
        }
      }
    },
    dispose() {
      unlisten();
      win.removeEventListener("popstate", onPopState);
    },
  };
}

/** The guard of the page in the browser; `dirty` is whether there is anything unsaved. */
export function useUnsavedGuard(dirty: boolean, message: string): void {
  const messageRef = useRef(message);
  messageRef.current = message;
  const guard = useRef<UnsavedGuard | null>(null);

  useEffect(() => {
    const w = window;
    const guardWindow: GuardEnv["window"] = {
      history: w.history,
      location: w.location,
      ask: askLeave,
      addEventListener: (type, listener) => w.addEventListener(type, listener as unknown as EventListener),
      removeEventListener: (type, listener) => w.removeEventListener(type, listener as unknown as EventListener),
    };
    guard.current = createUnsavedGuard({ window: guardWindow, document: document as unknown as GuardEnv["document"] }, () => messageRef.current);
    return () => {
      guard.current?.dispose();
      guard.current = null;
    };
  }, []);

  useEffect(() => {
    guard.current?.update(dirty);
  }, [dirty]);
}

/** The same question for a button that navigates through the router: resolves `true` when the user may go (the platform's dialog; nothing is asked on a clean page). */
export async function confirmLeave(dirty: boolean, message: string): Promise<boolean> {
  return !dirty || askLeave(message);
}

/** «Leave the page and lose the edits?» in the platform's dialog. */
export function askLeave(message: string): Promise<boolean> {
  return askConfirm({ title: "Несохранённые правки", message, confirmLabel: "Уйти", cancelLabel: "Остаться", tone: "danger" });
}
