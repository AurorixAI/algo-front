/**
 * The sticky save bar of a payroll preview lives inside its section: it floats above the bottom bar while the section
 * has room for it, and goes away with the section.  A sticky box cannot rise above the top of its parent, so while the
 * section is only just entering from the bottom of a short phone the bar is pushed down to the top of the section - partly
 * behind the bottom navigation.  It is not shown in that moment (it is still in the layout, so nothing jumps): it appears
 * when it fits entirely above its pin line.  No React here: node:test loads this file.
 */

/** The bar is where it floats: its bottom edge is not below the pin line (the viewport's bottom minus the offset above the bottom bar). */
export function barFitsAbovePin(input: { barBottom: number; viewportHeight: number; pinOffset: number; tolerance?: number }): boolean {
  const { barBottom, viewportHeight, pinOffset, tolerance = 1 } = input;
  if (![barBottom, viewportHeight, pinOffset].every(Number.isFinite)) return true; // cannot measure: do not hide a button
  return barBottom <= viewportHeight - pinOffset + tolerance;
}
