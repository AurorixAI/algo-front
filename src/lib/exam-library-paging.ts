/** The library loads exams by pages («Показать ещё»): a page is appended without duplicates, a refresh replaces what was loaded. */
export interface PagedExam {
  exam_id: string;
}

export function appendExamPage<T extends PagedExam>(loaded: T[], page: T[]): T[] {
  const seen = new Set(loaded.map((exam) => exam.exam_id));
  return [...loaded, ...page.filter((exam) => !seen.has(exam.exam_id))];
}

/** Counters of the tabs are exact only when everything is loaded; with more pages left a number is «12+» and nothing loaded yet is «—» (unknown, not zero). */
export function tabCountLabel(count: number, hasMore: boolean): string {
  if (!hasMore) return String(count);
  return count > 0 ? `${count}+` : "—";
}
