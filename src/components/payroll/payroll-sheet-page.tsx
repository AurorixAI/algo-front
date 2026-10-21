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
  isDataChanged,
  isOpenMonth,
  isRateRequired,
  isRevisionConflict,
  sheetMonthNote,
  monthTitle,
  payrollErrorText,
  sheetCardStatus,
  sheetFileName,
  sheetTotal,
  teacherLabel,
  versionLabel,
  type PayrollDiff,
  type PayrollRevision,
  type PayrollErrorLike,
  type PayrollSheet,
  type SheetEdits,
} from "@/lib/payroll";
import { createRequestSequence } from "@/lib/request-sequence";
import { saveBlobAs } from "@/lib/download";
import { useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { effectiveRole } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";
import { useToast } from "@/components/ui/toast";
import { PayrollPageMenu } from "./month-status";
import { PayrollSheetTable } from "./sheet-table";
import { SheetSummaryCard } from "./sheet-summary";
import { BackLink, ConflictBanner, PayrollForbidden, RateRequiredNotice, RevisionList, SaveBar, usePrintWithDates } from "./sheet-controls";

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
  return { ...sheet, teacher_name: teacherLabel(sheet.teacher_name) };
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
  const [dataChanged, setDataChanged] = useState<{ message: string; fingerprint: string | null; acknowledged: boolean } | null>(null);

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
    setSaving(true);
    setSaveError(null);
    setRateMissing(null);
    try {
      const updated = await orgApi.patchPayrollSheet(sheet.id, buildPatchBody(sheet, edits, note, { recalculate, expectedFingerprint: diff?.source_fingerprint ?? dataChanged?.fingerprint ?? null }));
      if (sheetIdRef.current !== requestedFor) return;
      showToast(
        `${recalculate ? "Ведомость пересчитана" : "Сохранено"} · ${updated.revision ? versionLabel(updated.revision) : "новая версия"}`,
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
      if (isRevisionConflict(error)) setConflict(true);
      else if (isDataChanged(error)) setDataChanged({ message: payrollErrorText(error), fingerprint: freshFingerprintOf(error), acknowledged: false });
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
      delta: diff?.stale ? diff.delta_amount : null,
    })
    : null;
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
            <button type="button" onClick={() => void load()} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
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
                className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-all sm:flex-none ${
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
                  <button type="button" onClick={() => void loadRevisions()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
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
                  actionLabel="Пересчитать"
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
              {rateMissing && <RateRequiredNotice teacherId={sheet.teacher_id} message={rateMissing} />}
              <SheetSummaryCard
                sheet={sheet}
                total={total}
                accrued={accruedUnpaid(views)}
                status={status}
                savedBy={sheet.updated_by_name}
                busy={saving}
                diff={diff}
                onPrimary={() => void apply(true)}
                onExcel={() => void download()}
                exporting={exporting}
                onPrint={print}
              />
              {diffFailed && (
                <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500 print:hidden">
                  Не удалось проверить, изменились ли данные после сохранения.
                  <button type="button" onClick={() => void loadDiff()} className="font-medium text-primary-700 underline-offset-2 hover:underline">Проверить снова</button>
                </p>
              )}
              <PayrollSheetTable sheet={sheet} edits={edits} forceDates={printing} onEdits={(update) => { setSaveError(null); setEdits(update); }} />
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
      {toastNode}
    </div>
  );
}
