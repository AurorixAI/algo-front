import { useEffect, useRef } from "react";

/**
 * Asks before the user leaves a page with unsaved edits.  Three ways out are covered:
 * - closing / reloading the tab and typing another address: the browser's own question (`beforeunload`);
 * - a click on any link to another page of the app (the menu, «Назад»): a confirm, and the click is cancelled
 *   on «Остаться» before the router sees it;
 * - the browser's Back button: while the page is dirty one extra history entry sits above it, so Back lands
 *   on the same address first and the confirm is asked there (a router cannot cancel a Back itself).
 * A link that stays on the same page (a tab, an anchor) is not a way out.  Buttons that navigate through the
 * router must ask for themselves (`confirmLeave`).
 */
export function useUnsavedGuard(dirty: boolean, message: string): void {
  const messageRef = useRef(message);
  messageRef.current = message;
  const leaving = useRef(false);
  const sentinel = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaving.current) return;
      event.preventDefault();
      event.returnValue = "";
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      // Another site is covered by beforeunload; the same page (a tab, an anchor) is not a way out.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm(messageRef.current)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPopState = () => {
      if (leaving.current) return;
      if (window.confirm(messageRef.current)) {
        leaving.current = true;
        window.history.back();
      } else {
        window.history.pushState(window.history.state, "", window.location.href);
      }
    };

    if (!sentinel.current) {
      sentinel.current = true;
      window.history.pushState(window.history.state, "", window.location.href);
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [dirty]);
}

/** The same question for a button that navigates through the router: true when the user may go. */
export function confirmLeave(dirty: boolean, message: string): boolean {
  return !dirty || window.confirm(message);
}
