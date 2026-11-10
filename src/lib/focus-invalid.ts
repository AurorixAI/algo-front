/**
 * After a refused save: the focus goes to the FIRST field of the open window that says why (aria-invalid), in the order of the screen.
 * A radio group is invalid as a whole - its first radio gets the focus.  Runs after the render that showed the messages.
 */
export function focusFirstInvalid(): void {
  setTimeout(() => {
    const body = document.querySelector<HTMLElement>('[data-modal-part="body"]') ?? document.body;
    const target = body.querySelector<HTMLElement>('input[aria-invalid="true"], select[aria-invalid="true"], textarea[aria-invalid="true"], [aria-invalid="true"] input, [aria-invalid="true"] button');
    target?.focus();
  }, 50);
}
