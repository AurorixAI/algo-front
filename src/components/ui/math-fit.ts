/**
 * Last-resort fit for a formula that is still wider than its container after
 * every legal line break was taken: shrink the formulas (not the prose) by at
 * most 15 %.  If even that is not enough the element keeps its internal
 * horizontal scroll and the original size.
 */
export const MIN_MATH_FIT = 0.85;

/** Widest overflow ratio (scrollWidth / clientWidth) of the element or one of its display blocks. */
function overflowRatio(el: HTMLElement): number {
  let ratio = 1;
  const boxes: HTMLElement[] = [el, ...Array.from(el.querySelectorAll<HTMLElement>(".katex-display"))];
  for (const box of boxes) {
    if (box.clientWidth > 0 && box.scrollWidth > box.clientWidth + 1) {
      ratio = Math.max(ratio, box.scrollWidth / box.clientWidth);
    }
  }
  return ratio;
}

function setFit(el: HTMLElement, fit: number): void {
  if (fit >= 1) {
    el.removeAttribute("data-math-fit");
    el.style.removeProperty("--math-fit");
  } else {
    el.setAttribute("data-math-fit", "");
    el.style.setProperty("--math-fit", fit.toFixed(3));
  }
}

/** Returns the applied scale (1 = unchanged). Synchronous: layout is read between writes. */
export function fitMathElement(el: HTMLElement): number {
  setFit(el, 1);
  let ratio = overflowRatio(el);
  if (ratio <= 1) return 1;
  let fit = 1;
  for (let i = 0; i < 4 && ratio > 1; i++) {
    fit = Math.max(MIN_MATH_FIT, Math.floor((fit / ratio) * 1000) / 1000);
    setFit(el, fit);
    ratio = overflowRatio(el);
    if (fit <= MIN_MATH_FIT) break;
  }
  if (ratio > 1) {
    setFit(el, 1);
    return 1;
  }
  return fit;
}
