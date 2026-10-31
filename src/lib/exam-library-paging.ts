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

export interface LibraryPage<T> {
  items: T[];
  total: number;
  hasMore: boolean;
}

/** What `GET /exams?page=…` may answer: a page, or - an older server that does not know `page` - the plain array of everything it has. */
export type LibraryPageResponse<T> = { items?: T[]; total?: number; has_more?: boolean } | T[];

export function readLibraryPage<T>(response: LibraryPageResponse<T>): LibraryPage<T> {
  if (Array.isArray(response)) return { items: response, total: response.length, hasMore: false };
  return { items: response.items ?? [], total: Number(response.total ?? 0), hasMore: Boolean(response.has_more) };
}

/** Pages 1..`pages` in order (a refresh keeps as many pages as the teacher had opened); stops at the first page that says there is no more. Any failure is thrown as it is. */
export async function loadLibraryPages<T extends PagedExam>(
  fetchPage: (page: number) => Promise<LibraryPageResponse<T>>,
  pages: number,
): Promise<LibraryPage<T> & { pagesLoaded: number }> {
  let items: T[] = [];
  let hasMore = false;
  let total = 0;
  let pagesLoaded = 0;
  for (let page = 1; page <= Math.max(1, pages); page += 1) {
    const read = readLibraryPage(await fetchPage(page));
    items = appendExamPage(items, read.items);
    hasMore = read.hasMore;
    total = read.total;
    pagesLoaded = page;
    if (!hasMore) break;
  }
  return { items, total, hasMore, pagesLoaded };
}

/** «Показать ещё»: the next page appended to what is loaded. A failure leaves `loaded` as it was and is thrown, so the button can be pressed again. */
export async function loadNextLibraryPage<T extends PagedExam>(
  fetchPage: (page: number) => Promise<LibraryPageResponse<T>>,
  loaded: T[],
  pagesLoaded: number,
): Promise<LibraryPage<T> & { pagesLoaded: number }> {
  const read = readLibraryPage(await fetchPage(pagesLoaded + 1));
  return { items: appendExamPage(loaded, read.items), total: read.total, hasMore: read.hasMore, pagesLoaded: pagesLoaded + 1 };
}
