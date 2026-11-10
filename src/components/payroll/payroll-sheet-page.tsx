"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  EMPTY_EDITS,
  EMPTY_SHEET_REASON,
  REVISION_CONFLICT_TEXT,
  UNSAVED_TEXT,
  accruedUnpaid,
  buildLineViews,
  buildPatchBody,
  editsDirty,
  freshFingerprintOf,
  freshPricesOf,
  isDataChanged,
  isOpenMonth,
  isRateRequired,
  isRevisionConflict,
  sheetMonthNote,
  monthTitle,
  payrollErrorText,
  changedItem,
  sheetCardStatus,
  sheetFileName,
  sheetNoFeeHref,
  sheetTodoItems,
  sheetTotal,
  versionLabel,
  type PayrollDiff,
  type PayrollMonthWarnings,
  type PayrollRevision,
  type PayrollErrorLike,
  type PayrollSheet,
  type RatesNow,
  type SheetEdits,
} from "@/lib/payroll";
import { teacherFullName } from "@/lib/person-name";
import { CLOSE_MONTH_DONE, CLOSE_MONTH_LABEL, periodOf, periodView, reopenToast, type PayrollPeriodItem } from "@/lib/closed-period";
import { createRequestSequence } from "@/lib/request-sequence";
import { saveBlobAs } from "@/lib/download";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { effectiveRole } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { FINGERPRINT_REQUIRED_TEXT, isFingerprintRequired, isLineNotFound, LINE_NOT_FOUND_TEXT, RESAVE_LABEL, savedTableNote } from "@/lib/payroll-logica";
import { ReopenMonthDialog } from "./reopen-month-dialog";
import { confirmUnfinishedLessons, sendConfirmingOpenLessons } from "./confirm-open-lessons";
import { openLessonsGate } from "@/lib/payroll-open-lessons";
import { PayrollPageMenu } from "./month-status";
import { SheetPayoutBlock } from "./payout-block";
import { PayrollSheetTable } from "./sheet-table";
import { SheetSummaryCard } from "./sheet-summary";
import { SheetTodoBlock } from "./sheet-todo";
import { BackLink, ConflictBanner, PayrollForbidden, RateRequiredNotice, RevisionList, SaveBar, usePrintWithDates } from "./sheet-controls";
import { Button } from "@/components/ui/button";

type Tab = "sheet" | "history";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "sheet", label: "Ведомость" },
  { key: "history", label: "История сохранений" },
];

interface Failure {
  message: string;
  retry: boolean;
  forbidden: boolean;
}

export function PayrollSheetPage({ sheetId }: { sheetId: string }) {
  // The page reads `?tab=`, so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <PayrollSheetContent sheetId={sheetId} />
    </Suspense>
  );
}

/** A teacher the server could not name still has a heading. */
function named(sheet: PayrollSheet): PayrollSheet {
  return { ...sheet, teacher_name: teacherFullName(sheet) };
}

function PayrollSheetContent({ sheetId }: { sheetId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab: Tab = searchParams?.get("tab") === "history" ? "history" : "sheet";
  const user = useAuthStore((state) => state.user);
  // /owner/* is for the owner only; the layout guard is the first line, this is the second.
  const denied = Boolean(user) && effectiveRole(user) !== "owner";
  const { showToast, toastNode } = useToast();

  const [sheet, setSheet] = useState<PayrollSheet | null>(null);
  const [edits, setEdits] = useState<SheetEdits>(EMPTY_EDITS);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [diff, setDiff] = useState<PayrollDiff | null>(null);
  const [diffFailed, setDiffFailed] = useState(false);
  const [revisions, setRevisions] = useState<PayrollRevision[] | null>(null);
  const [revisionsFailed, setRevisionsFailed] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** A recalculation was refused for want of a rate: the server's words; the notice leads to «Сотрудники». */
  const [rateMissing, setRateMissing] = useState<string | null>(null);
  /** The recalculation was refused because the data moved after the diff the owner looked at (409 SHEET_DATA_CHANGED). */
  const [dataChanged, setDataChanged] = useState<{ message: string; fingerprint: string | null; acknowledged: boolean; actionLabel?: string } | null>(null);

  /** The rate in force in the month of the sheet (what «Сотрудники» says now): the card names a difference from the saved one. */
  const [ratesNow, setRatesNow] = useState<RatesNow | null>(null);
  /**
   * The warnings of this teacher in this month by TODAY's data (the month overview, as on the month row): the saved lines may
   * lack a price the group has since got.  null while unknown; `failed` falls back to the sheet's own counters.
   */
  const [freshWarnings, setFreshWarnings] = useState<PayrollMonthWarnings | null>(null);
  const [freshUndecided, setFreshUndecided] = useState(0);
  const [warningsFailed, setWarningsFailed] = useState(false);
  /** Money-1 A1: is the month of this teacher closed / reopened (null while unknown or when the list could not be read: the sheet then says nothing about it). */
  const [period, setPeriod] = useState<PayrollPeriodItem | null>(null);
  const [reopening, setReopening] = useState(false);

  const loads = useRef(createRequestSequence());
  const diffs = useRef(createRequestSequence());
  const history = useRef(createRequestSequence());
  const sheetIdRef = useRef(sheetId);
  sheetIdRef.current = sheetId;

  const { printing, print } = usePrintWithDates();
  const dirty = editsDirty(edits);
  useUnsavedGuard(dirty, UNSAVED_TEXT);

  const loadDiff = useCallback(async () => {
    const token = diffs.current.next();
    setDiffFailed(false);
    try {
      const data = await orgApi.getPayrollDiff(sheetId);
      if (diffs.current.isCurrent(token)) setDiff(data);
    } catch {
      if (diffs.current.isCurrent(token)) { setDiff(null); setDiffFailed(true); }
    }
  }, [sheetId]);

  const loadRevisions = useCallback(async () => {
    const token = history.current.next();
    setRevisionsFailed(false);
    try {
      const data = await orgApi.getPayrollRevisions(sheetId);
      if (history.current.isCurrent(token)) setRevisions(data);
    } catch {
      if (history.current.isCurrent(token)) setRevisionsFailed(true);
    }
  }, [sheetId]);

  /** `silent`: refresh in place (after a save), without the spinner. */
  const load = useCallback(async (silent = false) => {
    const token = loads.current.next();
    if (!silent) setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getPayrollSheet(sheetId);
      if (!loads.current.isCurrent(token)) return;
      setSheet(named(data));
      setEdits(EMPTY_EDITS);
      setNote("");
      setConflict(false);
      setSaveError(null);
      setRevisions(null);
      void loadDiff();
    } catch (cause) {
      if (!loads.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      if (silent && status !== 403) {
        showToast(payrollErrorText(cause as PayrollErrorLike), "error");
        return;
      }
      if (!silent) setSheet(null);
      setFailure({
        message: payrollErrorText(cause as PayrollErrorLike),
        retry: !status || status >= 500,
        forbidden: status === 403,
      });
    } finally {
      if (loads.current.isCurrent(token)) setLoading(false);
    }
  }, [sheetId, loadDiff, showToast]);

  useEffect(() => {
    if (!sheetId || denied) { setLoading(false); return; }
    setSheet(null);
    setDiff(null);
    setRevisions(null);
    void load();
    const sequences = [loads.current, diffs.current, history.current];
    return () => { sequences.forEach((sequence) => sequence.next()); };
  }, [sheetId, denied, load]);

  useEffect(() => {
    if (tab === "history" && sheet && revisions === null && !revisionsFailed) void loadRevisions();
  }, [tab, sheet, revisions, revisionsFailed, loadRevisions]);

  // The rate in force in the month of this sheet, read again after every save / recalculation (a quiet failure: the card just says nothing)
  const rateKey = sheet ? `${sheet.id}|${sheet.revision}|${sheet.month}|${sheet.teacher_id}` : "";
  useEffect(() => {
    if (!sheet || denied) { setRatesNow(null); setFreshWarnings(null); setFreshUndecided(0); setPeriod(null); return undefined; }
    let cancelled = false;
    orgApi.getPayrollPeriods(sheet.month)
      .then((answer) => { if (!cancelled) setPeriod(periodOf(answer, sheet.teacher_id)); })
      .catch(() => { if (!cancelled) setPeriod(null); });
    orgApi.getPayrollMonth(sheet.month)
      .then((overview) => {
        if (cancelled) return;
        const row = overview.teachers.find((candidate) => candidate.teacher_id === sheet.teacher_id);
        setFreshWarnings(row ? row.warnings : null);
        setFreshUndecided(row?.undecided_lessons ?? 0);
        setWarningsFailed(!row);
      })
      .catch(() => { if (!cancelled) { setFreshWarnings(null); setWarningsFailed(true); } });
    orgApi.getPayrollRates(sheet.month)
      .then((answer) => {
        if (cancelled) return;
        const item = answer.items.find((candidate) => candidate.teacher_id === sheet.teacher_id);
        setRatesNow(item ? Object.fromEntries(Object.entries(item.rates ?? {}).map(([type, rate]) => [type, rate ? { percent: rate.percent, valid_from: rate.valid_from } : null])) : null);
      })
      .catch(() => { if (!cancelled) setRatesNow(null); });
    return () => { cancelled = true; };
    // the key says when the sheet changed; the sheet itself changes on every edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rateKey, denied]);

  // The title becomes the default file name when the sheet is saved as PDF from the print dialog.
  useEffect(() => {
    if (!sheet) return;
    const previous = document.title;
    document.title = sheetFileName(sheet.teacher_name, sheet.month).replace(/\.xlsx$/, "");
    return () => { document.title = previous; };
  }, [sheet]);

  const setTab = (next: Tab) => {
    router.replace(next === "history" ? "?tab=history" : "?", { scroll: false });
  };

  const apply = async (recalculate: boolean) => {
    if (!sheet || !sheet.id || saving) return;
    const requestedFor = sheetId;
    const fingerprint = diff?.source_fingerprint ?? dataChanged?.fingerprint ?? null;
    // LOGIC-A F14: a recalculation without the fingerprint of the data the owner looked at is refused (422 FINGERPRINT_REQUIRED):
    // say so at once and read the data again instead of sending it.
    if (recalculate && !fingerprint) {
      setDataChanged({ message: FINGERPRINT_REQUIRED_TEXT, fingerprint: null, acknowledged: false, actionLabel: "Проверить данные" });
      return;
    }
    // Money-1 I-4: any save of a month that is over closes it.  The unresolved lessons are the SERVER's question (R3 m3: `confirm_open_lessons` false -> 409 -> the window -> true, only about the
    // lessons the owner has not confirmed yet); only «не удалось проверить» - which the server cannot see - is asked here
    const checkGate = openLessonsGate({
      monthOpen: sheet.month_open || isOpenMonth(sheet.month, formatBusinessDate()),
      openLessons: null,
      unknown: warningsFailed || freshWarnings?.open_lessons_unknown === true,
    });
    if (checkGate.kind === "unknown" && !(await confirmUnfinishedLessons(checkGate))) return;
    setSaving(true);
    setSaveError(null);
    setRateMissing(null);
    try {
      const outcome = await sendConfirmingOpenLessons(
        (confirmOpenLessons) => orgApi.patchPayrollSheet(sheet.id!, buildPatchBody(sheet, edits, note, { recalculate, expectedFingerprint: fingerprint, confirmOpenLessons })),
        (asking) => setSaving(!asking),
      );
      if (outcome.cancelled) return;
      const updated = outcome.value;
      if (sheetIdRef.current !== requestedFor) return;
      const closedAgain = period?.state === "reopened";
      showToast(
        `${closedAgain ? CLOSE_MONTH_DONE : recalculate ? "Новая сумма сохранена" : "Сохранено"} · ${updated.revision ? versionLabel(updated.revision) : "новая версия"}`,
      );
      loads.current.next();
      setDataChanged(null);
      setSheet(named(updated));
      setEdits(EMPTY_EDITS);
      setNote("");
      setConflict(false);
      setRevisions(null);
      setDiff(null);
      void loadDiff();
    } catch (cause) {
      if (sheetIdRef.current !== requestedFor) return;
      const error = cause as PayrollErrorLike;
      if (isLineNotFound(error)) { setSaveError(LINE_NOT_FOUND_TEXT); void load(true); }
      else if (isRevisionConflict(error)) setConflict(true);
      else if (isDataChanged(error)) setDataChanged({ message: payrollErrorText(error), fingerprint: freshFingerprintOf(error), acknowledged: false });
      else if (isFingerprintRequired(error)) setDataChanged({ message: FINGERPRINT_REQUIRED_TEXT, fingerprint: null, acknowledged: false, actionLabel: "Проверить данные" });
      else if (isRateRequired(error)) setRateMissing(payrollErrorText(error));
      else setSaveError(payrollErrorText(error));
    } finally {
      setSaving(false);
    }
  };

  const download = async () => {
    if (!sheet?.id || exporting) return;
    setExporting(true);
    try {
      const file = await orgApi.downloadPayrollSheet(sheet.id, sheetFileName(sheet.teacher_name, sheet.month));
      saveBlobAs(file.blob, file.filename);
      if (dirty) showToast("В файле сохранённая версия: несохранённые правки в него не вошли", "warning");
    } catch (cause) {
      showToast(payrollErrorText(cause as PayrollErrorLike), "error");
    } finally {
      setExporting(false);
    }
  };

  if (denied || failure?.forbidden) return <PayrollForbidden />;

  const backHref = sheet?.month ? `/owner/payroll?month=${sheet.month}` : "/owner/payroll";
  const views = sheet ? buildLineViews(sheet, edits) : [];
  const total = sheet ? sheetTotal(sheet, views, edits) : 0;
  const status = sheet
    ? sheetCardStatus({
      saved: true,
      stale: diff ? diff.stale : sheet.stale,
      dirty,
      updatedAt: sheet.updated_at,
      // ONE number (R3 unconfirmed 1): «изменилась на ±N» is `payout.changed_by` - the same fresh-minus-saved the month list shows (`diff.delta_amount` is the same difference by the same formula, `changed_by`
      // is the one the server keeps on the sheet; the diff is for the lines).  null: the server could not count the fresh total (a rate is missing) - the card says only that the data changed.
      delta: sheet.payout && sheet.payout.fresh_total !== null ? sheet.payout.changed_by : null,
      reopened: period?.state === "reopened",
    })
    : null;
  // R2-2а: the card says the number of now, the table (and the Excel file) the lines of the saved sheet - the table says so
  const tableNote = sheet && !dirty ? savedTableNote({ payout: sheet.payout, updatedAt: sheet.updated_at }) : null;
  // UX pack §5.2-бис: the block «Что нужно сделать» over the card - only what needs an action, each item with its button; the saving of a changed salary is the button of the item
  const counts = warningsFailed ? sheet?.warnings : freshWarnings;
  const todo = sheet ? sheetTodoItems({
    counts: counts ?? null,
    noFeeHref: counts === sheet.warnings ? sheetNoFeeHref(sheet) : undefined,
    openUnknown: counts === sheet.warnings && sheet.id === null && counts?.open_lessons === null,
    // the count of NOW (the same `undecided_lessons` the «Замены» list counts); the saved `undecided_total` only when the fresh one could not be read (R4 Д1: it stayed after the decision)
    undecidedVisits: warningsFailed ? sheet.undecided_total : null,
    undecidedLessons: freshUndecided,
    changed: status?.tone === "changed" && sheet.id ? changedItem({ sheet: { id: sheet.id, stale: true }, payout: sheet.payout }) : null,
  }) : [];
  const monthNote = sheet ? sheetMonthNote(sheet.month_open || isOpenMonth(sheet.month, formatBusinessDate())) : null;

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 print:max-w-none print:space-y-3">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <BackLink href={backHref}>
          <ArrowLeft className="h-4 w-4" />
          Зарплата{sheet?.month ? ` · ${monthTitle(sheet.month)}` : ""}
        </BackLink>
        {sheet && <PayrollPageMenu divisor={sheet.divisor_default} />}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500 print:hidden">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : failure ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-14 text-center print:hidden">
          <AlertCircle className="h-7 w-7 text-rose-500" />
          <p className="text-sm font-medium text-slate-700">{failure.message}</p>
          {failure.retry && (
            <Button type="button" onClick={() => void load()} variant="secondary" size="md" className="mt-1">Повторить</Button>
          )}
        </div>
      ) : sheet && status ? (
        <>
          <header className="min-w-0">
            <h1 className="break-words text-xl font-bold text-slate-900 md:text-2xl">{sheet.teacher_name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">
              Ведомость за {monthTitle(sheet.month).toLowerCase()}
              {monthNote ? ` · ${monthNote}` : ""}
            </p>
            <p className="mt-1 hidden text-xs text-slate-500 print:block">Сформировано {formatBusinessDate().split("-").reverse().join(".")}</p>
          </header>

          <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 sm:w-fit print:hidden" role="tablist">
            {TABS.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={`min-h-10 flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-none ${
                  tab === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "history" ? (
            <div role="tabpanel" className="space-y-3 print:hidden">
              {revisionsFailed ? (
                <div role="alert" className="flex flex-col items-center gap-2 py-10 text-center">
                  <p className="text-sm font-medium text-slate-700">Не удалось загрузить историю сохранений</p>
                  <Button type="button" onClick={() => void loadRevisions()} variant="secondary" size="md">Повторить</Button>
                </div>
              ) : revisions === null ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin text-primary-600" />Загрузка…</div>
              ) : (
                <RevisionList revisions={revisions} currentRevision={sheet.revision} />
              )}
            </div>
          ) : (
            <div role="tabpanel" className="min-w-0 space-y-4">
              {conflict && (
                <ConflictBanner
                  message={REVISION_CONFLICT_TEXT}
                  reloading={refreshing}
                  onReload={async () => { setRefreshing(true); await load(true); setRefreshing(false); }}
                />
              )}
              {dataChanged && !dataChanged.acknowledged && (
                <ConflictBanner
                  message={dataChanged.message}
                  actionLabel={dataChanged.actionLabel ?? "Пересчитать"}
                  reloading={refreshing}
                  onReload={async () => {
                    // Look at the new difference first; the next «Пересчитать» expects exactly this data.
                    setRefreshing(true);
                    await loadDiff();
                    setRefreshing(false);
                    setDataChanged((current) => (current ? { ...current, acknowledged: true } : current));
                  }}
                />
              )}
              {saveError && !dirty && <p role="alert" className="text-sm font-medium text-rose-700 print:hidden">{saveError}</p>}
              {rateMissing && <RateRequiredNotice teacherId={sheet.teacher_id} message={rateMissing} month={sheet.month} />}
              <SheetTodoBlock items={todo} onSave={() => void apply(true)} saving={saving} saveLabel={period?.state === "reopened" ? CLOSE_MONTH_LABEL : RESAVE_LABEL} />
              <SheetSummaryCard
                sheet={sheet}
                total={total}
                accrued={accruedUnpaid(views)}
                status={status}
                savedBy={sheet.updated_by_name}
                busy={saving}
                diff={diff}
                ratesNow={ratesNow}
                warnings={warningsFailed ? undefined : freshWarnings}
                period={periodView(period)}
                monthRunning={Boolean(monthNote)}
                onReopen={period && sheet.id ? () => setReopening(true) : undefined}
                onPrimary={() => void apply(true)}
                onExcel={() => void download()}
                exporting={exporting}
                onPrint={print}
              />
              {sheet.id && sheet.payout && (
                <SheetPayoutBlock
                  sheetId={sheet.id}
                  month={sheet.month}
                  teacherName={sheet.teacher_name ?? ""}
                  payout={sheet.payout}
                  onChanged={(text) => { showToast(text); void load(true); }}
                />
              )}
              {diffFailed && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500 print:hidden">
                  Не удалось проверить, изменились ли данные после сохранения.
                  <button type="button" onClick={() => void loadDiff()} className="font-medium text-primary-700 underline-offset-2 hover:underline">Проверить снова</button>
                </p>
              )}
              <PayrollSheetTable caption={tableNote} sheet={sheet} edits={edits} forceDates={printing} freshPrices={diff?.stale ? freshPricesOf(diff) : undefined} onEdits={(update) => { setSaveError(null); setEdits(update); }} />
            </div>
          )}
          {/* A direct child of the page, not of the tab panel: a sticky bar can only move inside its parent, and the
              panel starts far below the top, so on a short phone the bar would stay behind the bottom navigation. */}
          {tab !== "history" && (
            <SaveBar
              dirty={dirty}
              problem={saveError}
              blockedReason={sheet.lines.length === 0 ? EMPTY_SHEET_REASON : null}
              saving={saving}
              note={note}
              onNote={setNote}
              onSave={() => void apply(false)}
              onDiscard={() => { setEdits(EMPTY_EDITS); setSaveError(null); }}
            />
          )}
        </>
      ) : null}
      <ReopenMonthDialog
        target={reopening && sheet && period ? { month: sheet.month, teacherId: sheet.teacher_id, teacherName: sheet.teacher_name, sheetRevision: period.sheetRevision } : null}
        onClose={() => setReopening(false)}
        onReopened={(result) => {
          setReopening(false);
          setPeriod((current) => (current ? { ...current, state: result.state, closedOn: result.closedOn, reopened: result.reopened } : current));
          showToast(reopenToast(result));
        }}
      />
      {toastNode}
    </div>
  );
}
