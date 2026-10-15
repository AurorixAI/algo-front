import { useEffect, useRef } from "react";

/** What the guard needs of the browser: injected, so a test can drive it with a fake history. */
export interface GuardEnv {
  window: {
    history: {
      readonly state: unknown;
      pushState(state: unknown, unused: string, url?: string | null): void;
      back(): void;
    };
    location: { readonly href: string; readonly pathname: string; readonly search: string; readonly origin: string };
    confirm(message: string): boolean;
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
 * - a click on any link to another page of the app (the menu, «Назад»): a confirm, and the click is cancelled
 *   on «Остаться» before the router sees it;
 * - the browser's Back button: while the page is dirty one extra history entry (the sentinel) sits above it, so
 *   Back lands on the same address first and the confirm is asked there (a router cannot cancel a Back itself).
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
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = event.target as { closest?: (selector: string) => unknown } | null;
    const anchor = (target && typeof target.closest === "function" ? target.closest("a[href]") : null) as
      | { href: string; target?: string; hasAttribute(name: string): boolean }
      | null;
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
    if (!win.confirm(getMessage())) {
      event.preventDefault();
      event.stopPropagation();
    }
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
    if (win.confirm(getMessage())) {
      leaving = true;
      win.history.back();
    } else {
      pushSentinel();
    }
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
    guard.current = createUnsavedGuard({ window: window as unknown as GuardEnv["window"], document: document as unknown as GuardEnv["document"] }, () => messageRef.current);
    return () => {
      guard.current?.dispose();
      guard.current = null;
    };
  }, []);

  useEffect(() => {
    guard.current?.update(dirty);
  }, [dirty]);
}

/** The same question for a button that navigates through the router: true when the user may go. */
export function confirmLeave(dirty: boolean, message: string): boolean {
  return !dirty || window.confirm(message);
}
