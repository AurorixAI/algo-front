/** «7 класс» - the ONE caption of a class on every screen (no «7 кл», no «7-й»). */
export function classLabel(level: number | string | null | undefined, empty = ""): string {
  const n = Number(level);
  return Number.isFinite(n) && n > 0 ? `${n} класс` : empty;
}
