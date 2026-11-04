/**
 * After a form closes (the button «Назад»), the focus goes back to the button that opened it.  The button itself was taken off the page while the form was open,
 * so the new one is found by its mark; the first of the selectors that exists gets the focus.  The keyboard user does not lose his place (nothing happens without a DOM).
 */
export function focusEntryAgain(root: ParentNode | null | undefined, selectors: string[]): void {
  if (typeof requestAnimationFrame !== "function") return;
  requestAnimationFrame(() => {
    for (const selector of selectors) {
      const element = root?.querySelector<HTMLElement>(selector);
      if (element) { element.focus(); return; }
    }
  });
}
