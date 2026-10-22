"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Download, Loader2, Search, Upload, Wallet, X } from "lucide-react";
import { orgApi } from "@/lib/api";
import { saveBlobAs } from "@/lib/download";
import { basesOfPayments } from "@/lib/ia-links";
import {
  applyBulk,
  applyFresh,
  appliedText,
  bulkDoneText,
  changedCount,
  classifyOpeningsError,
  draftOfRow,
  draftProblems,
  filterGroups,
  flatRows,
  initiallyOpenGroups,
  isChanged,
  isSelectable,
  itemErrorText,
  itemsOf,
  keyForBody,
  lessonItems,
  lessonsArrow,
  NO_FILTERS,
  OPENINGS_ONLY_MISSING,
  OPENINGS_SHOW_LEFT,
  OPENINGS_TITLE,
  OPENINGS_UNSAVED,
  openingsIntro,
  previewErrors,
  progressOf,
  prunedDrafts,
  selectedRows,
  staleIds,
  staleMessage,
  toggleGroupSelection,
  withoutDrafts,
  type BulkAction,
  type Drafts,
  type OpeningBatchItem,
  type OpeningGroupBlock,
  type OpeningRow,
  type OpeningsFailure,
  type OpeningsFilters,
  type OpeningsImportPreview,
  type OpeningsList,
  type RowDraft,
} from "@/lib/openings";
import { formatDateRu } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { pluralRu } from "@/lib/plural";
import { createRequestSequence } from "@/lib/request-sequence";
import { useOpeningsSummary } from "@/lib/openings-summary";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { useToast } from "@/components/ui/toast";
import {
  OpeningsBulkBar,
  OpeningsDoneDialog,
  OpeningsExcelDialog,
  OpeningsReviewDialog,
  type ExcelState,
  type ReviewState,
} from "@/components/payments/openings-dialogs";
import { OpeningsGroups } from "@/components/payments/openings-rows";

const newKey = (): string => {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};

type Notice = { tone: "info" | "warn"; text: string } | null;

/**
 * «Оплаты → Остатки на начало» (ROADMAP #125): every active student of the centre by group; the owner marks who paid ahead and who owed
 * before the accounting start - in the rows or for many at once - looks at what it does to the debts, and saves everything in one go.
 * The rules, the conversion of lessons and the figures are the server's (`/org/opening-balances/*`); this screen keeps the drafts,
 * asks for the preview and handles the refusals (somebody changed a row, a payment came between the check and the save).
 * Shared by /owner/payments/openings and /admin/payments/openings (the server decides who may).
 */
export function OpeningsPage({ paymentsHref }: { paymentsHref: string }) {
  const { showToast, toastNode } = useToast();
  const studentsBase = basesOfPayments(paymentsHref).students;
  const summaryHook = useOpeningsSummary();

  // ── the table
  const [data, setData] = useState<OpeningsList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [tooMany, setTooMany] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Array<{ id: string; name: string; teacher_name?: string | null }>>([]);
  const [serverGroup, setServerGroup] = useState("");
  const [includeLeft, setIncludeLeft] = useState(false);
  const requests = useRef(createRequestSequence());

  // ── what the user did
  const [drafts, setDrafts] = useState<Drafts>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<OpeningsFilters>(NO_FILTERS);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const [arrows, setArrows] = useState<Record<string, string>>({});
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<Notice>(null);

  // ── dialogs
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewItems, setReviewItems] = useState<OpeningBatchItem[]>([]);
  const [reason, setReason] = useState("");
  const [excel, setExcel] = useState<ExcelState | null>(null);
  const [excelReason, setExcelReason] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const [doneBusy, setDoneBusy] = useState(false);
  const [doneError, setDoneError] = useState<string | null>(null);
  const [busyFile, setBusyFile] = useState<"export" | "import" | null>(null);
  const keyRef = useRef<{ sig: string; key: string } | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const reviewSeq = useRef(createRequestSequence());
  const firstLoad = useRef(true);

  const rows = useMemo(() => flatRows(data?.groups ?? []), [data]);
  const start = data?.accounting_start ?? "";
  const paidUntilMax = data?.paid_until_max ?? "";
  const dirtyCount = useMemo(() => changedCount(rows, drafts), [rows, drafts]);
  useUnsavedGuard(dirtyCount > 0, OPENINGS_UNSAVED);

  // ── loading
  const load = useCallback(async (options: { silent?: boolean; left?: boolean; group?: string } = {}) => {
    const token = requests.current.next();
    if (!options.silent) setLoading(true);
    setLoadError(null);
    try {
      const group = options.group ?? serverGroup;
      const result = await orgApi.listOpenings({ include_left: options.left ?? includeLeft, group_id: group || undefined });
      if (!requests.current.isCurrent(token)) return;
      setData(result);
      setTooMany(null);
      setDenied(false);
      if (firstLoad.current) {
        firstLoad.current = false;
        setOpenIds(initiallyOpenGroups(result.groups, false));
      }
      // The drafts of rows that now equal what is saved (or are gone) are dropped
      setDrafts((previous) => prunedDrafts(flatRows(result.groups), previous));
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const failure = classifyOpeningsError(cause, "Не удалось загрузить остатки");
      if (failure.kind === "denied") setDenied(true);
      else if (failure.kind === "too_many_rows") {
        setTooMany(failure.message);
        orgApi.listGroups().then((list) => setCatalog((Array.isArray(list) ? list : []).map((g: { id: string; name: string; teacher_name?: string | null }) => ({ id: g.id, name: g.name, teacher_name: g.teacher_name })))).catch(() => undefined);
      } else setLoadError(failure.message);
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [includeLeft, serverGroup]);

  useEffect(() => {
    void load();
    return () => { requests.current.next(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshMoney = useCallback(() => {
    void summaryHook.refresh(true);
    void usePaymentsSummary.getState().refresh(true);
  }, [summaryHook]);

  // ── the visible rows
  const visible = useMemo(() => filterGroups(data?.groups ?? [], filters, drafts), [data, filters, drafts]);
  const visibleRows = useMemo(() => flatRows(visible), [visible]);
  const searching = filters.search.trim() !== "";
  const effectiveOpen = useMemo(() => (searching ? new Set(visible.map((group) => group.id)) : openIds), [searching, visible, openIds]);
  const clientProblems = useMemo(() => draftProblems(rows, drafts, { paidUntilMax }), [rows, drafts, paidUntilMax]);
  const problems = useMemo(() => ({ ...serverProblems, ...clientProblems }), [serverProblems, clientProblems]);
  const groupOptions = useMemo(
    () => (data && !serverGroup && !tooMany ? data.groups.map((g) => ({ id: g.id, name: g.name, teacher_name: g.teacher_name })) : catalog),
    [data, serverGroup, tooMany, catalog],
  );

  // ── editing
  const closePreview = useCallback(() => { setReview(null); reviewSeq.current.next(); }, []);

  const edit = useCallback((row: OpeningRow, patch: Partial<RowDraft>) => {
    setServerProblems((previous) => { if (!(row.membership_id in previous)) return previous; const { [row.membership_id]: _gone, ...rest } = previous; return rest; });
    setSkipIds((previous) => { if (!previous.has(row.membership_id)) return previous; const next = new Set(previous); next.delete(row.membership_id); return next; });
    setDrafts((previous) => {
      const base = previous[row.membership_id] ?? draftOfRow(row);
      const next: RowDraft = { ...base, ...patch, clear: false };
      if (!isChanged(row, next)) { const { [row.membership_id]: _gone, ...rest } = previous; return rest; }
      return { ...previous, [row.membership_id]: next };
    });
  }, []);

  const undo = useCallback((row: OpeningRow) => {
    setDrafts((previous) => { const { [row.membership_id]: _gone, ...rest } = previous; return rest; });
  }, []);

  const discardAll = () => { setDrafts({}); setServerProblems({}); setSkipIds(new Set()); setNotice(null); };

  // ── selection and the bulk bar
  const toggleRow = useCallback((id: string) => {
    setSelected((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }, []);
  const toggleGroup = useCallback((group: OpeningGroupBlock) => setSelected((previous) => toggleGroupSelection(group.memberships, previous)), []);
  const chosen = useMemo(() => selectedRows(rows, selected), [rows, selected]);
  const selectableVisible = useMemo(() => visibleRows.filter(isSelectable), [visibleRows]);

  const runBulk = (action: BulkAction) => {
    if (!data || chosen.length === 0) return;
    const result = applyBulk(chosen, drafts, action, { accountingStart: data.accounting_start, paidUntilMax: data.paid_until_max });
    setDrafts(result.drafts);
    setServerProblems({});
    setSelected(new Set());
    closePreview();
    showToast(bulkDoneText(action, result, data.accounting_start), result.applied === 0 ? "warning" : "success");
  };

  // ── lessons mode: «осталось K уроков → оплачено до» (a quick dry run of those rows only)
  const lessonSig = useMemo(() => JSON.stringify(lessonItems(itemsOf(rows, drafts)).map((item) => [item.membership_id, item.lessons_left])), [rows, drafts]);
  useEffect(() => {
    const items = lessonItems(itemsOf(rows, drafts)).slice(0, 300);
    if (items.length === 0) { setArrows((previous) => (Object.keys(previous).length ? {} : previous)); return undefined; }
    let alive = true;
    const timer = window.setTimeout(() => {
      orgApi.previewOpeningBatch({ items })
        .then((preview) => {
          if (!alive) return;
          const next: Record<string, string> = {};
          for (const item of preview.items) { const arrow = lessonsArrow(item.lessons); if (arrow) next[item.membership_id] = arrow; }
          setArrows(next);
        })
        .catch(() => undefined);
    }, 600);
    return () => { alive = false; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonSig]);

  // ── «Проверить» → preview → «Сохранить»
  const runPreview = useCallback(async (items: OpeningBatchItem[], reasonText: string, notice: string | null = null) => {
    const token = reviewSeq.current.next();
    setReviewItems(items);
    setReview({ phase: "loading", preview: null, error: null, notice, reasonForced: false });
    try {
      const preview = await orgApi.previewOpeningBatch({ items, reason: reasonText.trim() || null });
      if (!reviewSeq.current.isCurrent(token)) return;
      // Somebody changed a row after the table was read: that row gets the saved values (a fresh read), the other edits stay
      const stale = staleIds(preview);
      if (stale.length > 0) {
        setDrafts((previous) => withoutDrafts(previous, stale));
        setServerProblems({});
        setSkipIds(new Set());
        setNotice({ tone: "warn", text: staleMessage(stale.length) });
        closePreview();
        void load({ silent: true });
        return;
      }
      setServerProblems(previewErrors(preview));
      const next: Record<string, string> = {};
      for (const item of preview.items) { const arrow = lessonsArrow(item.lessons); if (arrow) next[item.membership_id] = arrow; }
      if (Object.keys(next).length) setArrows((previous) => ({ ...previous, ...next }));
      setReview({ phase: "ready", preview, error: null, notice, reasonForced: false });
    } catch (cause) {
      if (!reviewSeq.current.isCurrent(token)) return;
      const failure = classifyOpeningsError(cause, "Не удалось проверить остатки");
      setReview({ phase: "error", preview: null, error: failure.message, notice: null, reasonForced: false });
    }
  }, [closePreview, load]);

  const startReview = () => {
    if (!data) return;
    const bad = Object.keys(clientProblems);
    if (bad.length > 0) {
      showToast(`Исправьте ${bad.length} ${pluralRu(bad.length, "строку", "строки", "строк")} — они отмечены красным`, "error");
      document.querySelector(`[data-membership-id="${CSS.escape(bad[0])}"]`)?.scrollIntoView({ block: "center" });
      return;
    }
    const items = itemsOf(rows, drafts, skipIds);
    if (items.length === 0) return;
    void runPreview(items, reason);
  };

  /** After a save (grid or file): the drafts of the saved rows go, the table is read again, the counters of the other screens too. */
  const afterSaved = useCallback((ids: string[]) => {
    setDrafts((previous) => withoutDrafts(previous, ids));
    setSelected((previous) => { const next = new Set(previous); ids.forEach((id) => next.delete(id)); return next; });
    setServerProblems({});
    setSkipIds(new Set());
    void load({ silent: true });
    refreshMoney();
  }, [load, refreshMoney]);

  /** 409 `STALE_ITEMS`: those rows get the values somebody else saved and lose the edits; every other edit stays. */
  const handleStale = useCallback((failure: Extract<OpeningsFailure, { kind: "stale" }>) => {
    setData((previous) => (previous ? { ...previous, groups: applyFresh(previous.groups, failure.fresh) } : previous));
    setDrafts((previous) => withoutDrafts(previous, failure.ids));
    setServerProblems({});
    setSkipIds(new Set());
    setNotice({ tone: "warn", text: failure.message });
    closePreview();
    setExcel(null);
    void load({ silent: true });
  }, [closePreview, load]);

  const confirmSave = async () => {
    if (!review?.preview) return;
    const preview = review.preview;
    const reasonText = reason.trim() || null;
    keyRef.current = keyForBody(keyRef.current, { items: reviewItems, reason: reasonText, digest: preview.digest }, newKey);
    setReview({ ...review, phase: "saving", error: null });
    try {
      const applied = await orgApi.applyOpeningBatch({ items: reviewItems, reason: reasonText, idempotency_key: keyRef.current.key, digest: preview.digest });
      closePreview();
      setReason("");
      setNotice(null);
      showToast(appliedText(applied));
      afterSaved(reviewItems.map((item) => item.membership_id));
    } catch (cause) {
      const failure = classifyOpeningsError(cause, "Не удалось сохранить");
      if (failure.kind === "stale") return handleStale(failure);
      if (failure.kind === "preview_stale") {
        // A payment came (or a price changed) between the check and the save: the figures are new, the user decides again
        if (failure.preview) {
          setServerProblems(previewErrors(failure.preview));
          setReview({ phase: "ready", preview: failure.preview, error: null, notice: failure.message, reasonForced: false });
        } else void runPreview(reviewItems, reason, failure.message);
        return undefined;
      }
      if (failure.kind === "invalid") {
        const problemsNow: Record<string, string> = {};
        for (const item of failure.items) problemsNow[item.membership_id] = itemErrorText(item.code, item.message);
        setServerProblems(problemsNow);
        closePreview();
        setNotice({ tone: "warn", text: failure.message });
        return undefined;
      }
      if (failure.kind === "reason") {
        setReview({ ...review, phase: "ready", error: null, notice: failure.message, reasonForced: true });
        return undefined;
      }
      setReview({ ...review, phase: "ready", error: failure.message, notice: null });
      return undefined;
    }
    return undefined;
  };

  const dropErrors = () => {
    if (!review?.preview) return;
    const bad = new Set(review.preview.items.filter((item) => item.status === "error").map((item) => item.membership_id));
    const items = reviewItems.filter((item) => !bad.has(item.membership_id));
    setSkipIds((previous) => new Set([...Array.from(previous), ...Array.from(bad)]));
    if (items.length === 0) { closePreview(); return; }
    void runPreview(items, reason);
  };

  // ── Excel
  const download = async () => {
    if (busyFile) return;
    setBusyFile("export");
    try {
      const file = await orgApi.exportOpenings({ group_id: filters.groupId || serverGroup || undefined, missing_only: filters.onlyMissing, q: filters.search.trim() || undefined, include_left: includeLeft });
      saveBlobAs(file.blob, file.filename);
      if (dirtyCount > 0) showToast("В файл попали только сохранённые остатки — ваши правки в таблице пока не сохранены", "warning");
    } catch (cause) {
      showToast(classifyOpeningsError(cause, "Не удалось скачать файл").message, "error");
    } finally {
      setBusyFile(null);
    }
  };

  const onFile = async (file: File | null) => {
    if (!file) return;
    setBusyFile("import");
    setExcelReason("");
    setExcel({ phase: "loading", fileName: file.name, report: null, error: null, notice: null, reasonForced: false });
    try {
      const report = await orgApi.importOpeningsPreview(file);
      setExcel({ phase: "ready", fileName: file.name, report, error: null, notice: null, reasonForced: false });
    } catch (cause) {
      setExcel({ phase: "error", fileName: file.name, report: null, error: classifyOpeningsError(cause, "Не удалось прочитать файл").message, notice: null, reasonForced: false });
    } finally {
      setBusyFile(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const applyExcel = async () => {
    if (!excel?.report) return;
    const report: OpeningsImportPreview = excel.report;
    const reasonText = excelReason.trim() || null;
    keyRef.current = keyForBody(keyRef.current, { items: report.batch_items, reason: reasonText, digest: report.digest }, newKey);
    setExcel({ ...excel, phase: "saving", error: null });
    try {
      const applied = await orgApi.applyOpeningBatch({ items: report.batch_items, reason: reasonText, idempotency_key: keyRef.current.key, digest: report.digest });
      setExcel(null);
      setExcelReason("");
      setNotice(null);
      showToast(appliedText(applied));
      afterSaved(report.batch_items.map((item) => item.membership_id));
    } catch (cause) {
      const failure = classifyOpeningsError(cause, "Не удалось применить файл");
      if (failure.kind === "stale") return handleStale(failure);
      if (failure.kind === "preview_stale") {
        const fresh = failure.preview;
        setExcel({
          ...excel, phase: "ready", error: null, notice: failure.message, reasonForced: false,
          report: fresh ? { ...report, digest: fresh.digest, ok: fresh.ok, summary: fresh.summary, impact: fresh.impact, needs_reason: fresh.needs_reason, items: fresh.items } : report,
        });
        return undefined;
      }
      if (failure.kind === "reason") { setExcel({ ...excel, phase: "ready", error: null, notice: failure.message, reasonForced: true }); return undefined; }
      setExcel({ ...excel, phase: "ready", error: failure.message });
      return undefined;
    }
    return undefined;
  };

  // ── «Готово»
  const finish = async () => {
    setDoneBusy(true);
    setDoneError(null);
    try {
      const next = await orgApi.setOpeningsState("done");
      summaryHook.replace(next);
      setData((previous) => (previous ? { ...previous, state: next.state } : previous));
      setDoneOpen(false);
      showToast("Готово: учёт оплат идёт с даты начала");
    } catch (cause) {
      setDoneError(classifyOpeningsError(cause, "Не удалось сохранить ответ").message);
    } finally {
      setDoneBusy(false);
    }
  };

  // ── rendering
  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
        <Wallet className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Раздел «Оплаты» недоступен</p>
        <p className="text-xs text-slate-400">Доступ даёт владелец центра в настройках.</p>
      </div>
    );
  }

  const progress = data ? progressOf(data.totals) : null;
  const doneAll = data ? data.state === "done" || (progress !== null && progress.left === 0 && progress.needed > 0) : false;
  const canFinish = Boolean(data) && !doneAll && data!.state !== "skipped" && progress !== null && progress.left > 0 && dirtyCount === 0;
  const hasLeft = (data?.totals.left_available ?? 0) > 0 || includeLeft;
  const lessonsCentre = data?.period_mode === "lessons";

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-4 pb-2">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="min-w-0 max-w-2xl">
          <Link href={paymentsHref} data-testid="openings-back" className="mb-1.5 inline-flex items-center gap-0.5 text-sm font-medium text-slate-500 hover:text-slate-800">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Оплаты
          </Link>
          <h1 className="text-xl font-bold text-slate-900 md:text-2xl">{OPENINGS_TITLE}</h1>
          {data && <p className="mt-0.5 text-sm text-slate-500" data-testid="openings-intro">{openingsIntro(data.accounting_start)}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => void download()} disabled={!data || busyFile !== null} data-testid="openings-download" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {busyFile === "export" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4 text-slate-400" aria-hidden="true" />}
            Скачать файл
          </button>
          <button type="button" onClick={() => fileInput.current?.click()} disabled={!data || busyFile !== null} data-testid="openings-upload" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
            {busyFile === "import" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4 text-slate-400" aria-hidden="true" />}
            Загрузить файл
          </button>
          <input ref={fileInput} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" tabIndex={-1} aria-label="Файл с остатками (.xlsx)" data-testid="openings-file" onChange={(event) => void onFile(event.target.files?.[0] ?? null)} />
        </div>
      </div>

      {notice && (
        <div role="status" data-testid="openings-notice" className={`flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-sm ${notice.tone === "warn" ? "bg-amber-50 text-amber-900" : "bg-slate-100 text-slate-700"}`}>
          <p className="min-w-0 flex-1">{notice.text}</p>
          <button type="button" onClick={() => setNotice(null)} aria-label="Закрыть" className="shrink-0 rounded p-0.5 hover:bg-black/5"><X className="h-4 w-4" aria-hidden="true" /></button>
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500"><Loader2 className="h-7 w-7 animate-spin text-primary-600" />Загрузка…</div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
        </div>
      ) : tooMany ? (
        <div data-testid="openings-too-many" className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-800">{tooMany}</p>
          <select
            value={serverGroup}
            onChange={(event) => { setServerGroup(event.target.value); void load({ group: event.target.value }); }}
            aria-label="Группа"
            className="h-10 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-base sm:text-sm"
          >
            <option value="">Выберите группу…</option>
            {catalog.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
        </div>
      ) : data ? (
        <>
          {progress && (
            <section aria-label="Прогресс" className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="text-sm font-semibold text-slate-900" data-testid="openings-progress">{progress.text}</p>
                <p className="text-sm text-slate-500">
                  {progress.left > 0 ? `осталось ${progress.left}` : doneAll ? "всё заполнено" : ""}
                  {canFinish && (
                    <button type="button" onClick={() => { setDoneError(null); setDoneOpen(true); }} data-testid="openings-finish" className="ml-3 font-medium text-primary-700 hover:underline">Готово — остальным остаток не нужен</button>
                  )}
                </p>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} aria-label="Заполнено">
                <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress.percent}%` }} />
              </div>
              {data.totals.needs_review > 0 && (
                <p className="mt-2 text-xs text-rose-700" data-testid="openings-needs-review">У {data.totals.needs_review} остатков дата не подходит под начало учёта — они отмечены «проверьте даты».</p>
              )}
              {doneAll && <p className="mt-2 text-xs text-emerald-700">Учёт оплат идёт с {formatDateRu(data.accounting_start)}.</p>}
            </section>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="openings-filters">
            <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                value={filters.search}
                onChange={(event) => setFilters({ ...filters, search: event.target.value })}
                placeholder="Фамилия, имя или ID"
                aria-label="Поиск ученика"
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-base outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 sm:text-sm"
              />
            </div>
            <select
              value={serverGroup || filters.groupId}
              onChange={(event) => {
                if (serverGroup !== "" || groupOptions === catalog) { setServerGroup(event.target.value); void load({ group: event.target.value }); }
                else setFilters({ ...filters, groupId: event.target.value });
              }}
              aria-label="Группа"
              data-testid="openings-group-filter"
              className="h-10 min-w-0 max-w-full rounded-xl border border-slate-200 bg-white px-3 text-base outline-none focus:border-primary-500 sm:text-sm"
            >
              <option value="">Все группы</option>
              {groupOptions.map((group) => <option key={group.id} value={group.id}>{group.name}{group.teacher_name ? ` · ${group.teacher_name}` : ""}</option>)}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={filters.onlyMissing} onChange={(event) => setFilters({ ...filters, onlyMissing: event.target.checked })} data-testid="openings-only-missing" className="h-4 w-4 rounded border-slate-300 text-primary-600" />
              {OPENINGS_ONLY_MISSING}
            </label>
            {hasLeft && (
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={includeLeft}
                  onChange={(event) => { setIncludeLeft(event.target.checked); void load({ silent: true, left: event.target.checked }); }}
                  data-testid="openings-show-left"
                  className="h-4 w-4 rounded border-slate-300 text-primary-600"
                />
                {OPENINGS_SHOW_LEFT}{!includeLeft && data.totals.left_available > 0 ? ` (${data.totals.left_available})` : ""}
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-200 bg-white/60 py-14 text-center text-sm text-slate-400" data-testid="openings-empty">
              {data.groups.length === 0 ? "Учеников в группах пока нет" : filters.onlyMissing && !searching && !filters.groupId ? "Все остатки заполнены" : "Ничего не найдено"}
            </p>
          ) : (
            <OpeningsGroups
              groups={visible}
              drafts={drafts}
              problems={problems}
              arrows={arrows}
              selected={selected}
              openIds={effectiveOpen}
              accountingStart={start}
              paidUntilMax={paidUntilMax}
              studentsBase={studentsBase}
              onToggleOpen={(id) => setOpenIds((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; })}
              onToggleRow={toggleRow}
              onToggleGroup={toggleGroup}
              onEdit={edit}
              onUndo={undo}
            />
          )}
          {lessonsCentre && visible.length > 0 && (
            <p className="text-xs text-slate-500">В пакетах можно указать, сколько уроков осталось: ALGO сам найдёт дату, до которой они оплачены.</p>
          )}
        </>
      ) : null}

      {data && (chosen.length > 0 || dirtyCount > 0) && (
        <div className="sticky bottom-2 z-30 space-y-2 max-md:bottom-[calc(4.5rem+env(safe-area-inset-bottom))] print:hidden">
          {chosen.length > 0 && (
            <OpeningsBulkBar
              count={chosen.length}
              total={selectableVisible.length}
              accountingStart={start}
              onPaidUntil={(date) => runBulk({ kind: "paid_until", date })}
              onNoDebt={() => runBulk({ kind: "no_debt" })}
              onClear={() => runBulk({ kind: "clear" })}
              onSelectAll={() => setSelected(new Set(selectableVisible.map((row) => row.membership_id)))}
              onDeselect={() => setSelected(new Set())}
            />
          )}
          {dirtyCount > 0 && (
            <div role="region" aria-label="Несохранённые правки" data-testid="openings-save-bar" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-primary-200 bg-white px-4 py-3 shadow-lg">
              <p className="mr-auto text-sm text-slate-700"><span className="font-semibold text-slate-900" data-testid="openings-changed">Изменено: {dirtyCount}</span> <span className="text-slate-500">— пока не сохранено</span></p>
              <button type="button" onClick={discardAll} className="rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Отменить правки</button>
              <button type="button" onClick={startReview} data-testid="openings-check" className="rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700">Проверить</button>
            </div>
          )}
        </div>
      )}

      <OpeningsReviewDialog
        state={review}
        reason={reason}
        onReason={setReason}
        onSave={() => void confirmSave()}
        onClose={closePreview}
        onDropErrors={dropErrors}
      />
      <OpeningsExcelDialog state={excel} reason={excelReason} onReason={setExcelReason} onApply={() => void applyExcel()} onClose={() => setExcel(null)} />
      <OpeningsDoneDialog open={doneOpen} missing={data?.totals.missing ?? 0} busy={doneBusy} error={doneError} onConfirm={() => void finish()} onClose={() => setDoneOpen(false)} />
      {toastNode}
    </div>
  );
}
