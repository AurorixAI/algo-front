"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, Calculator, ChevronLeft, ChevronRight, Download, ExternalLink, Loader2, X } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate, shiftMonthKey } from "@/lib/business-time";
import { formatMoney } from "@/lib/payments";
import {
  EMPTY_EDITS,
  EMPTY_SHEET_REASON,
  REVISION_CONFLICT_TEXT,
  UNSAVED_TEXT,
  accruedUnpaid,
  buildLineViews,
  buildSaveBody,
  calculationGate,
  calculationScope,
  canGoToNextMonth,
  changedMonthsBar,
  editsDirty,
  isDataChanged,
  isOpenMonth,
  isRateRequired,
  isRevisionConflict,
  lessonsCountText,
  lessonsWithoutTeacherText,
  monthFileName,
  monthRateLines,
  rowStatus,
  monthTotals,
  teacherMonthNumbers,
  type TeacherMonthNumbers,
  monthSubtitle,
  monthTitle,
  parseMonthParam,
  payrollErrorText,
  rowAction,
  sheetCardStatus,
  sheetNoFeeHref,
  sheetTodoItems,
  ALL_SAVED_TEXT,
  sheetTotal,
  teacherLabel,
  teacherRateHref,
  SALARY_COLUMN,
  versionLabel,
  type ChangedPayrollMonth,
  type PayrollErrorLike,
  type PayrollMonthOverview,
  type PayrollMonthTeacher,
  type PayrollSheet,
  type SheetEdits,
} from "@/lib/payroll";
import { savedRevisionLine, statusHint } from "@/lib/payroll-help";
import { monthPeriodView, periodOf, periodView, type PayrollPeriods, type PeriodView } from "@/lib/closed-period";
import { openLessonsGate } from "@/lib/payroll-open-lessons";
import { FINGERPRINT_REQUIRED_TEXT, isFingerprintRequired, isLineNotFound, LINE_NOT_FOUND_TEXT } from "@/lib/payroll-logica";
import { createRequestSequence } from "@/lib/request-sequence";
import { saveBlobAs } from "@/lib/download";
import { askConfirm } from "@/lib/confirm-dialog";
import { confirmLeave, useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { effectiveRole } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";
import { TableHeader } from "@/components/attendance/table-chrome";
import { useToast } from "@/components/ui/toast";
import { PayrollMonthSummary, PayrollPageMenu } from "./month-status";
import { PayrollSheetTable } from "./sheet-table";
import { RowStatus } from "./row-status";
import { confirmUnfinishedLessons, sendConfirmingOpenLessons } from "./confirm-open-lessons";
import { SheetSummaryCard } from "./sheet-summary";
import { SheetTodoBlock } from "./sheet-todo";
import { ConflictBanner, PayrollForbidden, RateRequiredNotice, SaveBar, usePrintWithDates } from "./sheet-controls";

/**
 * The columns of the list (UX pack §5.2): Преподаватель | Зарплата, сум | Выплачено | Остаток | Статус | действие.  The identity on the left (under the name, quiet: the rates and the lessons), the three
 * numbers on the right, the status and the button centred.  A table from 1280; 1024 and a phone get cards in the same order.
 */
export const MONTH_COLUMNS = {
  grid: "xl:grid-cols-[minmax(0,2.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.9fr)]",
  labels: ["Преподаватель", `${SALARY_COLUMN}, сум`, "Выплачено, сум", "Остаток, сум", "Статус", ""],
  aligns: ["left", "right", "right", "right", "center", "center"] as Array<"left" | "right" | "center">,
};
const GRID = `xl:grid ${MONTH_COLUMNS.grid} xl:items-start xl:gap-x-3`;

interface Preview {
  sheet: PayrollSheet;
  edits: SheetEdits;
  note: string;
  saving: boolean;
  error: string | null;
  /** The server refused for want of a rate (the words are the server's); the notice leads to «Сотрудники». */
  rateMissing: string | null;
  /** Somebody else saved this teacher's sheet first (409 SHEET_REVISION_CONFLICT). */
  conflict: boolean;
  /** The data changed after this preview was calculated (409 SHEET_DATA_CHANGED): the server's words; nothing was saved. */
  dataChanged: string | null;
}

function freshPreview(sheet: PayrollSheet, note = ""): Preview {
  return { sheet, edits: EMPTY_EDITS, note, saving: false, error: null, rateMissing: null, conflict: false, dataChanged: null };
}

interface Failure {
  message: string;
  retry: boolean;
  forbidden: boolean;
}

function failureOf(cause: unknown): Failure {
  const error = cause as PayrollErrorLike | null;
  const status = error?.status;
  return { message: payrollErrorText(error), retry: !status || status >= 500, forbidden: status === 403 };
}

export function PayrollMonthPage() {
  // The page reads `?month=`, so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <PayrollMonthContent />
    </Suspense>
  );
}

function PayrollMonthContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = useMemo(() => formatBusinessDate(), []);
  const month = parseMonthParam(searchParams?.get("month"), today);
  const user = useAuthStore((state) => state.user);
  const denied = Boolean(user) && effectiveRole(user) !== "owner";
  const { showToast, toastNode } = useToast();

  const [overview, setOverview] = useState<PayrollMonthOverview | null>(null);
  // UX pack §5.1-тер: the months whose saved salary changed (the bar over the summary); a server without the answer draws no bar
  const [changedMonths, setChangedMonths] = useState<ChangedPayrollMonth[]>([]);
  useEffect(() => {
    let live = true;
    orgApi.getChangedPayrollMonths().then((items) => { if (live) setChangedMonths(items); }).catch(() => { if (live) setChangedMonths([]); });
    return () => { live = false; };
  }, []);
  /** Money-1 A1: the state of the month of each teacher with a saved sheet; null when it could not be read (the rows then say nothing about it). */
  const [periods, setPeriods] = useState<PayrollPeriods | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** The teachers being calculated (a row's button or «Рассчитать всех»): their buttons wait. */
  const [calculating, setCalculating] = useState<ReadonlySet<string> | "all" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const loads = useRef(createRequestSequence());
  const calcs = useRef(createRequestSequence());
  const monthRef = useRef(month);
  monthRef.current = month;
  const previewRef = useRef<HTMLElement | null>(null);
  const { printing, print } = usePrintWithDates();

  const dirty = Object.values(previews).some((preview) => editsDirty(preview.edits));
  useUnsavedGuard(dirty, UNSAVED_TEXT);

  /** `silent`: refresh the table in place (after a save) without the spinner. */
  const load = useCallback(async (silent = false) => {
    const token = loads.current.next();
    if (!silent) { setLoading(true); setOverview(null); setPeriods(null); }
    setFailure(null);
    try {
      const [data, state] = await Promise.all([
        orgApi.getPayrollMonth(month),
        orgApi.getPayrollPeriods(month).catch(() => null),
      ]);
      if (!loads.current.isCurrent(token)) return;
      setOverview(data);
      setPeriods(state);
    } catch (cause) {
      if (!loads.current.isCurrent(token)) return;
      if (silent) showToast(payrollErrorText(cause as PayrollErrorLike), "error");
      else setFailure(failureOf(cause));
    } finally {
      if (loads.current.isCurrent(token)) setLoading(false);
    }
  }, [month, showToast]);

  // A new month: nothing of the old one stays (previews), and only the newest answer counts.
  useEffect(() => {
    setPreviews({});
    setActiveId(null);
    setCalculating(null);
    if (denied) { setLoading(false); return; }
    void load();
    const sequences = [loads.current, calcs.current];
    return () => { sequences.forEach((sequence) => sequence.next()); };
    // `load` changes with the month and nothing else
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, denied]);

  // By name; a teacher the server could not name still has a row.
  const teachers = useMemo(
    () => (overview?.teachers ?? [])
      .map((teacher) => ({ ...teacher, teacher_name: teacherLabel(teacher.teacher_name) }))
      .sort((a, b) => a.teacher_name.localeCompare(b.teacher_name, "ru")),
    [overview],
  );
  const savedCount = teachers.filter((teacher) => teacher.sheet).length;
  // The server says so; a month that is the current one or later is open whatever it says.
  const monthOpen = overview ? overview.month_open || isOpenMonth(month, today) : false;
  // «Рассчитать всех» waits until every teacher has a rate (the rate is set once, in «Сотрудники»)
  const gate = calculationGate(teachers);
  // R4 Д5: «сохранено 2 из 2» of the summary line already says that every salary is saved - the hint under the button would say it twice (the button keeps it as its title)
  const allSaved = gate.text === ALL_SAVED_TEXT;
  const busy = calculating !== null;

  const goToMonth = async (next: string) => {
    if (!(await confirmLeave(dirty, UNSAVED_TEXT))) return;
    router.replace(`?month=${next}`, { scroll: false });
  };

  const withNames = (sheets: PayrollSheet[]): PayrollSheet[] =>
    sheets.map((sheet) => ({ ...sheet, teacher_name: teacherLabel(sheet.teacher_name) }));

  /**
   * `ids`: one teacher (a row's «Рассчитать») or the teachers with no saved sheet («Рассчитать всех», `all`).  The calculation
   * is a preview: nothing is written until the owner saves.  The rates are the stored ones, so nothing but the teachers is sent.
   */
  const calculate = async (ids: string[], all = false) => {
    if (!overview || busy || ids.length === 0) return;
    if (dirty) {
      const replace = await askConfirm({
        title: "Заменить предпросмотр?",
        message: "Новый расчёт заменит предпросмотр, в котором есть несохранённые правки.",
        confirmLabel: "Рассчитать заново",
        cancelLabel: "Оставить правки",
        tone: "danger",
      });
      if (!replace) return;
    }
    const requestedMonth = month;
    const token = calcs.current.next();
    setCalculating(all ? "all" : new Set(ids));
    try {
      const sheets = withNames(await orgApi.calculatePayroll(requestedMonth, { teacher_ids: ids }));
      // A newer calculation or another month started meanwhile: this answer is stale.
      if (!calcs.current.isCurrent(token) || monthRef.current !== requestedMonth) return;
      if (sheets.length === 0) {
        showToast("Для выбранных преподавателей нет данных за этот месяц", "warning");
        return;
      }
      const next: Record<string, Preview> = {};
      for (const sheet of sheets) next[sheet.teacher_id] = freshPreview(sheet);
      setPreviews(next);
      setActiveId(sheets[0].teacher_id);
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (cause) {
      if (!calcs.current.isCurrent(token) || monthRef.current !== requestedMonth) return;
      showToast(payrollErrorText(cause as PayrollErrorLike), "error");
      // the table said the rate was there and the server says it is not: read the month again
      if (isRateRequired(cause as PayrollErrorLike)) void load(true);
    } finally {
      if (calcs.current.isCurrent(token)) setCalculating(null);
    }
  };

  const patchPreview = (teacherId: string, patch: Partial<Preview>) => {
    setPreviews((previous) => (previous[teacherId] ? { ...previous, [teacherId]: { ...previous[teacherId], ...patch } } : previous));
  };

  /** An edit is applied to the newest edits of the preview, never to a copy a render ago. */
  const updateEdits = (teacherId: string, update: (previous: SheetEdits) => SheetEdits) => {
    setPreviews((previous) => {
      const preview = previous[teacherId];
      return preview ? { ...previous, [teacherId]: { ...preview, edits: update(preview.edits), error: null } } : previous;
    });
  };

  const closePreviews = async () => {
    if (!(await confirmLeave(dirty, UNSAVED_TEXT))) return;
    setPreviews({});
    setActiveId(null);
  };

  const savePreview = async (teacherId: string) => {
    const preview = previews[teacherId];
    if (!preview || preview.saving) return;
    const existing = teachers.find((teacher) => teacher.teacher_id === teacherId)?.sheet ?? null;
    const requestedMonth = month;
    // Money-1 I-4: the save of a month that is over closes it.  The unfinished lessons are the server's question (R3 #21: 409 `OPEN_LESSONS_CONFIRM_REQUIRED`,
    // asked below); only «не удалось проверить» - which the server cannot see - is asked here
    const warnings = preview.sheet.warnings;
    const gate = openLessonsGate({
      monthOpen: preview.sheet.month_open,
      openLessons: warnings.open_lessons,
      unknown: warnings.open_lessons === null,
      items: warnings.open_lesson_items,
    });
    if (gate.kind === "unknown" && !(await confirmUnfinishedLessons(gate))) return;
    patchPreview(teacherId, { saving: true, error: null, rateMissing: null });
    try {
      // the first request says `false`; the 409 of the server (new unresolved lessons) is asked in a window and only «Сохранить всё равно» sends the same request again with `true`
      const outcome = await sendConfirmingOpenLessons(
        (confirmOpenLessons) => orgApi.savePayrollSheet(buildSaveBody(preview.sheet, preview.edits, preview.note, existing ? existing.revision : null, confirmOpenLessons)),
        (asking) => { if (monthRef.current === requestedMonth) patchPreview(teacherId, asking ? { saving: false } : { saving: true, error: null }); },
      );
      if (outcome.cancelled) return;
      const saved = outcome.value;
      if (monthRef.current !== requestedMonth) return;
      showToast(`Ведомость сохранена${saved.revision ? ` · ${versionLabel(saved.revision)}` : ""}`);
      const remaining = Object.keys(previews).filter((id) => id !== teacherId);
      setPreviews((previous) => {
        const rest = { ...previous };
        delete rest[teacherId];
        return rest;
      });
      setActiveId((current) => (current === teacherId ? remaining[0] ?? null : current));
      void load(true);
    } catch (cause) {
      if (monthRef.current !== requestedMonth) return;
      const error = cause as PayrollErrorLike;
      if (isLineNotFound(error)) { patchPreview(teacherId, { saving: false, error: LINE_NOT_FOUND_TEXT }); void load(true); }
      else if (isRevisionConflict(error)) patchPreview(teacherId, { saving: false, conflict: true });
      else if (isDataChanged(error)) patchPreview(teacherId, { saving: false, dataChanged: payrollErrorText(error) });
      else if (isFingerprintRequired(error)) patchPreview(teacherId, { saving: false, dataChanged: FINGERPRINT_REQUIRED_TEXT });
      else if (isRateRequired(error)) patchPreview(teacherId, { saving: false, rateMissing: payrollErrorText(error) });
      else patchPreview(teacherId, { saving: false, error: payrollErrorText(error) });
    }
  };

  /** After a conflict or a change of the data: the table is reloaded and the teacher is calculated afresh. */
  const rerunPreview = async (teacherId: string) => {
    const preview = previews[teacherId];
    if (!preview) return;
    const requestedMonth = month;
    patchPreview(teacherId, { saving: true });
    await load(true);
    try {
      const sheets = withNames(await orgApi.calculatePayroll(requestedMonth, { teacher_ids: [teacherId] }));
      const fresh = sheets.find((sheet) => sheet.teacher_id === teacherId);
      if (monthRef.current !== requestedMonth) return;
      if (fresh) {
        setPreviews((previous) => (previous[teacherId] ? { ...previous, [teacherId]: freshPreview(fresh, preview.note) } : previous));
      } else {
        patchPreview(teacherId, { saving: false });
      }
    } catch (cause) {
      if (monthRef.current !== requestedMonth) return;
      patchPreview(teacherId, { saving: false });
      showToast(payrollErrorText(cause as PayrollErrorLike), "error");
    }
  };

  const downloadMonth = async () => {
    if (exporting || savedCount === 0) return;
    setExporting(true);
    try {
      const file = await orgApi.downloadPayrollMonth(month, monthFileName(month));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(payrollErrorText(cause as PayrollErrorLike), "error");
    } finally {
      setExporting(false);
    }
  };

  const openSheet = async (teacher: PayrollMonthTeacher) => {
    if (!teacher.sheet || !(await confirmLeave(dirty, UNSAVED_TEXT))) return;
    router.push(`/owner/payroll/${encodeURIComponent(teacher.sheet.id)}`);
  };

  if (denied || failure?.forbidden) return <PayrollForbidden />;

  const previewList = Object.values(previews);
  const active = activeId ? previews[activeId] : undefined;
  const activeExisting = activeId ? teachers.find((teacher) => teacher.teacher_id === activeId)?.sheet ?? null : null;
  const nextDisabled = !canGoToNextMonth(month, today);
  const totals = monthTotals(month, teachers, monthOpen);
  const bar = changedMonthsBar(changedMonths, month, today);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 print:max-w-none print:space-y-3">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>

      <div className="min-w-0 print:hidden">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Зарплата</h1>
        <p className="text-sm text-slate-600" data-testid="payroll-page-subtitle">{monthSubtitle(month, overview ? teachers.length : null)}</p>
      </div>

      <div className="space-y-2 print:hidden">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <nav aria-label="Месяц" className="flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-white p-1">
            <button
              type="button"
              aria-label="Предыдущий месяц"
              onClick={() => goToMonth(shiftMonthKey(month, -1))}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[10.5rem] px-2 text-center text-sm font-semibold text-slate-900" aria-live="polite">{monthTitle(month)}</span>
            <button
              type="button"
              aria-label="Следующий месяц"
              onClick={() => goToMonth(shiftMonthKey(month, 1))}
              disabled={nextDisabled}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </nav>

          <div className="flex w-full items-center gap-2 sm:w-auto sm:flex-wrap" data-testid="payroll-month-actions">
            <button
              type="button"
              onClick={() => void downloadMonth()}
              disabled={savedCount === 0 || exporting}
              title={savedCount === 0 ? "Сначала сохраните зарплату хотя бы одного преподавателя" : undefined}
              className="inline-flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:px-4"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Скачать Excel
            </button>
            <button
              type="button"
              onClick={() => void calculate(calculationScope(teachers).map((teacher) => teacher.teacher_id), true)}
              disabled={!overview || teachers.length === 0 || busy || !gate.ready}
              aria-describedby={gate.text && !allSaved ? "payroll-calculate-hint" : undefined}
              title={allSaved ? ALL_SAVED_TEXT : undefined}
              className="inline-flex min-h-[40px] min-w-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0 sm:flex-none sm:px-5"
            >
              {calculating === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
              Рассчитать всех
            </button>
            {overview && <PayrollPageMenu divisor={overview.divisor} />}
          </div>
        </div>

        {bar && (
          <div role="status" data-testid="changed-months-bar" className="flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 items-start gap-2 text-sm font-medium text-amber-900"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span className="min-w-0 break-words">{bar.text}</span></p>
            <button type="button" data-testid="changed-months-open" onClick={() => void goToMonth(bar.month)} className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100">{bar.button}</button>
          </div>
        )}
        <div className="space-y-1.5">
          {overview && <PayrollMonthSummary totals={totals} month={month} open={monthOpen} />}
          {overview && gate.text && !allSaved && (
            <p id="payroll-calculate-hint" className="text-xs text-slate-600">
              {gate.text}
              {gate.missing > 0 && (
                <>
                  .{" "}
                  <Link href="/owner/teachers" className="font-medium text-primary-700 hover:underline">Указать в «Сотрудниках»</Link>
                </>
              )}
            </p>
          )}
        </div>
      </div>

      {overview && lessonsWithoutTeacherText(overview.lessons_without_teacher) && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{lessonsWithoutTeacherText(overview.lessons_without_teacher)}</span>
        </p>
      )}

      <section aria-label="Преподаватели месяца" className="print:hidden">
        {loading ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
            Загрузка…
          </div>
        ) : failure ? (
          <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <AlertCircle className="h-8 w-8 text-rose-500" />
            <p className="max-w-md text-sm font-medium text-rose-800">{failure.message}</p>
            {failure.retry && (
              <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
            )}
          </div>
        ) : teachers.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-14 text-center text-sm text-slate-500">
            В этом месяце нет завершённых уроков — считать зарплату не за что.
          </p>
        ) : (
          <div className="xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white">
            <TableHeader
              show="xl"
              gridClass={MONTH_COLUMNS.grid}
              labels={MONTH_COLUMNS.labels}
              aligns={MONTH_COLUMNS.aligns}
            />
            <ul className="space-y-3 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {teachers.map((teacher) => (
                <TeacherRow
                  key={teacher.teacher_id}
                  teacher={teacher}
                  month={month}
                  period={monthPeriodView(periodView(periodOf(periods, teacher.teacher_id)), monthOpen)}
                  busy={busy}
                  onCalculate={() => void calculate([teacher.teacher_id])}
                  onOpen={() => openSheet(teacher)}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {previewList.length > 0 && active && (
        <section ref={previewRef} aria-label="Предпросмотр расчёта" className="min-w-0 space-y-4 scroll-mt-4">
          <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-slate-900">Предпросмотр расчёта</h2>
              <p className="text-sm text-slate-500">Ведомость ещё не сохранена. Проверьте и сохраните.</p>
            </div>
            <button
              type="button"
              onClick={closePreviews}
              className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
              Закрыть предпросмотр
            </button>
          </div>

          {previewList.length > 1 && (
            <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 print:hidden" role="tablist" aria-label="Преподаватели в предпросмотре">
              {previewList.map((preview) => (
                <button
                  key={preview.sheet.teacher_id}
                  type="button"
                  role="tab"
                  aria-selected={activeId === preview.sheet.teacher_id}
                  onClick={() => setActiveId(preview.sheet.teacher_id)}
                  className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                    activeId === preview.sheet.teacher_id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {preview.sheet.teacher_name}
                  {editsDirty(preview.edits) && <span aria-label="есть несохранённые правки" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" />}
                </button>
              ))}
            </div>
          )}

          <header className="min-w-0">
            <h3 className="break-words text-lg font-bold text-slate-900">{active.sheet.teacher_name}</h3>
            <p className="text-sm text-slate-500">Ведомость за {monthTitle(active.sheet.month || month).toLowerCase()} · предпросмотр</p>
          </header>

          {activeExisting && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-sm text-slate-700 print:hidden" title={savedRevisionLine(activeExisting.revision).hint}>
              <span>{savedRevisionLine(activeExisting.revision).text}</span>
              <Link href={`/owner/payroll/${encodeURIComponent(activeExisting.id)}`} className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">
                Открыть сохранённую <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}
          {active.conflict && (
            <ConflictBanner
              message={REVISION_CONFLICT_TEXT}
              reloading={active.saving}
              onReload={() => void rerunPreview(active.sheet.teacher_id)}
            />
          )}
          {active.dataChanged && (
            <ConflictBanner
              message={active.dataChanged}
              actionLabel="Пересчитать"
              reloading={active.saving}
              onReload={() => void rerunPreview(active.sheet.teacher_id)}
            />
          )}
          {active.rateMissing && <RateRequiredNotice teacherId={active.sheet.teacher_id} message={active.rateMissing} month={month} />}

          <PreviewBody
            preview={active}
            printing={printing}
            onPrint={print}
            onEdits={(update) => updateEdits(active.sheet.teacher_id, update)}
            onNote={(text) => patchPreview(active.sheet.teacher_id, { note: text })}
            onSave={() => void savePreview(active.sheet.teacher_id)}
            onDiscard={() => patchPreview(active.sheet.teacher_id, { edits: EMPTY_EDITS, error: null })}
          />
        </section>
      )}
      {toastNode}
    </div>
  );
}

/** One calculation not saved yet: the card on top, the groups under it, the floating bar for unsaved «начислить». */
function PreviewBody({
  preview, printing, onPrint, onEdits, onNote, onSave, onDiscard,
}: {
  preview: Preview;
  printing: boolean;
  onPrint: () => void;
  onEdits: (update: (previous: SheetEdits) => SheetEdits) => void;
  onNote: (text: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { sheet, edits } = preview;
  const views = useMemo(() => buildLineViews(sheet, edits), [sheet, edits]);
  const dirty = editsDirty(edits);
  const status = sheetCardStatus({ saved: false, stale: null, dirty, updatedAt: null, delta: null });
  return (
    <>
      <SheetTodoBlock items={sheetTodoItems({ counts: sheet.warnings, noFeeHref: sheetNoFeeHref(sheet), openUnknown: sheet.id === null && sheet.warnings.open_lessons === null, undecidedVisits: sheet.undecided_total })} />
      <SheetSummaryCard
        sheet={sheet}
        total={sheetTotal(sheet, views, edits)}
        accrued={accruedUnpaid(views)}
        status={status}
        busy={preview.saving}
        blockedReason={sheet.lines.length === 0 ? EMPTY_SHEET_REASON : null}
        onPrimary={onSave}
        onPrint={onPrint}
        note={preview.note}
        onNote={onNote}
      />
      {/* with unsaved «начислить» the floating bar shows the problem; otherwise it is said here */}
      {preview.error && !dirty && <p role="alert" className="text-sm font-medium text-rose-700 print:hidden">{preview.error}</p>}
      <PayrollSheetTable sheet={sheet} edits={edits} onEdits={onEdits} forceDates={printing} />
      {/* Inside the preview section: a sticky bar moves only inside its parent, so it floats while THIS preview is on screen
          and goes away with it (on the sheet page, where the bar is the whole page's, it is a direct child of the page). */}
      <SaveBar
        hideUntilFits
        dirty={dirty}
        problem={preview.error}
        blockedReason={sheet.lines.length === 0 ? EMPTY_SHEET_REASON : null}
        saving={preview.saving}
        note={preview.note}
        onNote={onNote}
        onSave={onSave}
        onDiscard={onDiscard}
      />
    </>
  );
}

/** «75 834» - a sum without the unit: the header of the column says «сум» at 1280; a card says it itself. */
const plainSum = (value: number): string => formatMoney(value).replace(/[\s\u00a0]*сум$/, "");

/** «Сум» after a number in a card (the table says it in the header of the column). */
function Unit() {
  return <span className="xl:hidden"> сум</span>;
}

/** The three numbers of a row, one cell each: at 1280 the cells of the grid, below it a row of three with their captions (UX pack §5.2). */
function RowNumbers({ numbers }: { numbers: TeacherMonthNumbers }) {
  const label = "mb-0.5 block text-xs font-normal text-slate-600 xl:hidden";
  const rest = numbers.rest;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-sm tabular-nums xl:contents">
      <div className="min-w-0 xl:text-right" data-testid="teacher-sum">
        <span className={label}>{SALARY_COLUMN}</span>
        {numbers.salary !== null ? <span className="font-semibold text-slate-900">{plainSum(numbers.salary)}<Unit /></span> : <span className="text-slate-500">—</span>}
        {numbers.caption && <p data-testid="teacher-sum-caption" className="text-xs font-normal leading-4 text-slate-600">{numbers.caption}</p>}
        {/* the change of the sum is told HERE, under the number («было 120 834»), not by a chip of its own (UX pack §5.2-бис) */}
        {numbers.was !== null && <p data-testid="teacher-sum-was" className="text-xs font-normal leading-4 text-slate-600">было {plainSum(numbers.was)}</p>}
      </div>
      <div className="min-w-0 xl:text-right" data-testid="teacher-paid">
        <span className={label}>Выплачено</span>
        {numbers.paid !== null ? <span className="text-slate-800">{plainSum(numbers.paid)}<Unit /></span> : <span className="text-slate-500">—</span>}
      </div>
      <div className="min-w-0 xl:text-right" data-testid="teacher-rest" data-kind={rest.kind}>
        <span className={label}>Остаток</span>
        {rest.kind === "left" && <span className="font-medium text-slate-900">{plainSum(rest.amount)}<Unit /></span>}
        {rest.kind === "ahead" && <span className="text-slate-600">вперёд {plainSum(rest.amount)}<Unit /></span>}
        {rest.kind === "more" && <span className="text-slate-600">больше на {plainSum(rest.amount)}<Unit /></span>}
        {rest.kind === "done" && <span className="font-medium text-emerald-700">выплачено ✓</span>}
        {rest.kind === "none" && <span className="text-slate-500">—</span>}
      </div>
    </div>
  );
}

/**
 * One teacher of the month (UX pack §5.2).  A table from 1280: the name with the rates and the lessons under it in a quiet line, ONE line of what needs an action, the three numbers (Зарплата · Выплачено ·
 * Остаток), ONE status chip (with a second small line only when the state of the month differs: «Месяц закрыт» / «Месяц переоткрыт») and ONE button.  1024 and a phone: the same as a card.
 */
export function TeacherRow({
  teacher, month, period = null, busy, onCalculate, onOpen,
}: {
  teacher: PayrollMonthTeacher;
  /** The month of the page: «Указать» opens the rate dialog with it. */
  month: string;
  /** Money-1 A1: the state of this teacher's month where it differs from the month's («Месяц закрыт» / «Месяц переоткрыт»); null: nothing to add. */
  period?: PeriodView | null;
  busy: boolean;
  onCalculate: () => void;
  onOpen: () => void;
}) {
  const status = rowStatus(teacher);
  const numbers = teacherMonthNumbers(teacher);
  const action = rowAction(teacher.sheet);
  const rate = monthRateLines(teacher);
  const rateMissing = (teacher.missing_rates ?? []).length > 0;
  const blocked = action.kind !== "open" && rateMissing;
  const run = action.kind === "open" ? onOpen : onCalculate;
  const meta = [...rate.lines, lessonsCountText(teacher.lessons_count)];

  return (
    <li className={`min-w-0 rounded-2xl border border-slate-200 bg-white p-4 xl:rounded-none xl:border-0 xl:px-4 xl:py-4 ${GRID}`}>
      <div className="min-w-0">
        <p className="min-w-0 break-words text-sm font-semibold text-slate-900">{teacher.teacher_name}</p>
        {/* the rates and the lessons: one quiet line («Группа 50% · Индив. 60% · 4 урока»); a piece never breaks in the middle */}
        <p data-testid="teacher-rate" className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 text-xs text-slate-600">
          {meta.map((piece, index) => (
            <span key={piece} className="inline-flex items-baseline gap-x-1.5">
              {index > 0 && <span aria-hidden="true">·</span>}
              <span className={piece.includes("нет ставки") ? "break-words" : "whitespace-nowrap"}>{piece}</span>
            </span>
          ))}
          {rate.none && <span className="text-slate-600">· ставка не задана</span>}
          {rate.missing && (
            <Link href={teacherRateHref(teacher.teacher_id, month)} className="font-medium text-amber-800 underline decoration-amber-400 underline-offset-2 hover:text-amber-900">Указать</Link>
          )}
        </p>
      </div>

      <RowNumbers numbers={numbers} />

      <div className="mt-3 min-w-0 space-y-1 xl:mt-0 xl:text-center">
        <RowStatus status={status} hint={statusHint(teacher.sheet)} name={teacher.teacher_name ?? ""} />
        {/* the state of the month, only when it differs from the month's: a small second line */}
        {period && (
          <p data-testid="period-chip" data-tone={period.tone} title={period.hint} className={`text-xs leading-4 ${period.tone === "reopened" ? "font-semibold text-amber-900" : period.tone === "closed" ? "font-medium text-slate-700" : "text-slate-600"}`}>{period.label}</p>
        )}
      </div>

      <div className="mt-3 flex items-center gap-1.5 xl:mt-0 xl:justify-center">
        <button
          type="button"
          onClick={run}
          disabled={busy || blocked}
          title={blocked ? "Сначала задайте ставку в «Сотрудниках»" : undefined}
          aria-label={`${action.label}: ${teacher.teacher_name}`}
          className="inline-flex min-h-[40px] w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[280px] xl:max-w-none"
        >
          {action.label}
        </button>
      </div>
    </li>
  );
}
