"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, AlertTriangle, Calculator, ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, Printer, X,
} from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  EMPTY_EDITS,
  UNSAVED_TEXT,
  buildCalculateBody,
  buildSaveBody,
  calculateButtonLabel,
  calculationScope,
  canGoToNextMonth,
  editsDirty,
  editsProblem,
  isOpenMonth,
  isRevisionConflict,
  lessonTypeLabel,
  monthFileName,
  monthPercentText,
  monthTitle,
  parseMonthParam,
  parsePercent,
  payrollErrorText,
  percentKey,
  percentProblems,
  revisionLabel,
  sanitizePercentTyping,
  shiftMonth,
  sheetFileName,
  sheetStatus,
  warningView,
  type PayrollMonthOverview,
  type PayrollMonthTeacher,
  type PayrollSheet,
  type SheetEdits,
} from "@/lib/payroll";
import { createRequestSequence } from "@/lib/request-sequence";
import { saveBlobAs } from "@/lib/download";
import { confirmLeave, useUnsavedGuard } from "@/lib/use-unsaved-guard";
import { effectiveRole } from "@/lib/role-home";
import { useAuthStore } from "@/lib/store";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { PayrollSheetTable } from "./sheet-table";
import { ConflictBanner, PayrollForbidden, PercentEditor, SaveBar, StatusChip } from "./sheet-controls";

const GRID = "xl:grid xl:grid-cols-[28px_minmax(0,1.1fr)_minmax(0,1.7fr)_minmax(0,1.2fr)_minmax(0,1.3fr)_40px] xl:items-start xl:gap-x-4";

interface Preview {
  sheet: PayrollSheet;
  edits: SheetEdits;
  note: string;
  saving: boolean;
  error: string | null;
  conflict: boolean;
}

interface Failure {
  message: string;
  retry: boolean;
  forbidden: boolean;
}

function failureOf(cause: unknown): Failure {
  const error = cause as { status?: number; code?: string; message?: string } | null;
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
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** The percent fields the owner has typed in (key: teacher|type); the others show the suggestion. */
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showErrors, setShowErrors] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [previews, setPreviews] = useState<Record<string, Preview>>({});
  const [activeId, setActiveId] = useState<string | null>(null);

  const loads = useRef(createRequestSequence());
  const calcs = useRef(createRequestSequence());
  const monthRef = useRef(month);
  monthRef.current = month;
  const previewRef = useRef<HTMLElement | null>(null);

  const dirty = Object.values(previews).some((preview) => editsDirty(preview.edits));
  useUnsavedGuard(dirty, UNSAVED_TEXT);

  /** `silent`: refresh the table in place (after a save) without the spinner and without losing what was typed. */
  const load = useCallback(async (silent = false) => {
    const token = loads.current.next();
    if (!silent) { setLoading(true); setOverview(null); }
    setFailure(null);
    try {
      const data = await orgApi.getPayrollMonth(month);
      if (!loads.current.isCurrent(token)) return;
      setOverview(data);
    } catch (cause) {
      if (!loads.current.isCurrent(token)) return;
      if (silent) showToast(payrollErrorText(cause as { status?: number; code?: string; message?: string }), "error");
      else setFailure(failureOf(cause));
    } finally {
      if (loads.current.isCurrent(token)) setLoading(false);
    }
  }, [month, showToast]);

  // A new month: nothing of the old one stays (fields, selection, previews), and only the newest answer counts.
  useEffect(() => {
    setTyped({});
    setSelected(new Set());
    setShowErrors(false);
    setPreviews({});
    setActiveId(null);
    setCalculating(false);
    if (denied) { setLoading(false); return; }
    void load();
    const sequences = [loads.current, calcs.current];
    return () => { sequences.forEach((sequence) => sequence.next()); };
    // `load` changes with the month and nothing else
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, denied]);

  const teachers = overview?.teachers ?? [];
  const savedCount = teachers.filter((teacher) => teacher.sheet).length;
  const allSelected = teachers.length > 0 && teachers.every((teacher) => selected.has(teacher.teacher_id));
  // The server says so; a month that is the current one or later is open whatever it says.
  const monthOpen = overview ? overview.month_open || isOpenMonth(month, today) : false;

  const goToMonth = (next: string) => {
    if (!confirmLeave(dirty, UNSAVED_TEXT)) return;
    router.replace(`?month=${next}`, { scroll: false });
  };

  const setType = (teacherId: string, lessonType: string, text: string) => {
    setTyped((previous) => ({ ...previous, [percentKey(teacherId, lessonType)]: sanitizePercentTyping(text) }));
  };

  const toggle = (teacherId: string) => {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(teacherId)) next.delete(teacherId);
      else next.add(teacherId);
      return next;
    });
  };

  const withNames = (sheets: PayrollSheet[]): PayrollSheet[] =>
    sheets.map((sheet) => {
      const row = teachers.find((teacher) => teacher.teacher_id === sheet.teacher_id);
      return row && sheet.teacher_name === "Преподаватель" ? { ...sheet, teacher_name: row.teacher_name } : sheet;
    });

  /** `only`: one teacher (a row's menu); else the selected ones, else everybody. */
  const calculate = async (only?: string) => {
    if (!overview || calculating) return;
    const chosen = only ? new Set([only]) : selected;
    const body = buildCalculateBody(teachers, typed, chosen);
    if (!body) {
      setShowErrors(true);
      const missing = percentProblems(calculationScope(teachers, chosen), typed).length;
      showToast(
        missing > 0
          ? "Укажите процент для каждого типа занятий — без него расчёт не запускается"
          : "Нет преподавателей для расчёта",
        "error",
      );
      return;
    }
    if (dirty && !window.confirm("Новый расчёт заменит предпросмотр, в котором есть несохранённые правки. Продолжить?")) return;
    const requestedMonth = month;
    const token = calcs.current.next();
    setCalculating(true);
    try {
      const sheets = withNames(await orgApi.calculatePayroll(requestedMonth, body));
      // A newer calculation or another month started meanwhile: this answer is stale.
      if (!calcs.current.isCurrent(token) || monthRef.current !== requestedMonth) return;
      if (sheets.length === 0) {
        showToast("Для выбранных преподавателей нет данных за этот месяц", "warning");
        return;
      }
      const next: Record<string, Preview> = {};
      for (const sheet of sheets) {
        next[sheet.teacher_id] = { sheet, edits: EMPTY_EDITS, note: "", saving: false, error: null, conflict: false };
      }
      setPreviews(next);
      setActiveId(sheets[0].teacher_id);
      window.setTimeout(() => previewRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    } catch (cause) {
      if (!calcs.current.isCurrent(token) || monthRef.current !== requestedMonth) return;
      showToast(payrollErrorText(cause as { status?: number; code?: string; message?: string }), "error");
    } finally {
      if (calcs.current.isCurrent(token)) setCalculating(false);
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

  const closePreviews = () => {
    if (!confirmLeave(dirty, UNSAVED_TEXT)) return;
    setPreviews({});
    setActiveId(null);
  };

  const savePreview = async (teacherId: string) => {
    const preview = previews[teacherId];
    if (!preview || preview.saving) return;
    const problem = editsProblem(preview.sheet, preview.edits);
    if (problem) { patchPreview(teacherId, { error: problem }); return; }
    const existing = teachers.find((teacher) => teacher.teacher_id === teacherId)?.sheet ?? null;
    const requestedMonth = month;
    patchPreview(teacherId, { saving: true, error: null });
    try {
      const saved = await orgApi.savePayrollSheet(buildSaveBody(preview.sheet, preview.edits, preview.note, existing ? existing.revision : null));
      if (monthRef.current !== requestedMonth) return;
      showToast(`Ведомость сохранена${saved.revision ? ` · ${revisionLabel(saved.revision)}` : ""}`);
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
      if (isRevisionConflict(cause as { status?: number; code?: string })) patchPreview(teacherId, { saving: false, conflict: true });
      else patchPreview(teacherId, { saving: false, error: payrollErrorText(cause as { status?: number; code?: string; message?: string }) });
    }
  };

  /** After a conflict: the saved sheet changed, so the table is reloaded and the teacher is calculated afresh. */
  const refreshPreview = async (teacherId: string) => {
    const preview = previews[teacherId];
    if (!preview) return;
    await load(true);
    const body = buildCalculateBody(teachers, typed, new Set([teacherId]));
    if (!body) { patchPreview(teacherId, { conflict: false }); return; }
    try {
      const sheets = withNames(await orgApi.calculatePayroll(month, body));
      const fresh = sheets.find((sheet) => sheet.teacher_id === teacherId);
      if (fresh && monthRef.current === month) {
        setPreviews((previous) => ({ ...previous, [teacherId]: { sheet: fresh, edits: EMPTY_EDITS, note: "", saving: false, error: null, conflict: false } }));
      }
    } catch (cause) {
      showToast(payrollErrorText(cause as { status?: number; code?: string; message?: string }), "error");
    }
  };

  const downloadMonth = async () => {
    if (exporting || savedCount === 0) return;
    setExporting(true);
    try {
      const file = await orgApi.downloadPayrollMonth(month, monthFileName(month));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(payrollErrorText(cause as { status?: number; code?: string; message?: string }), "error");
    } finally {
      setExporting(false);
    }
  };

  const downloadSheet = async (teacher: PayrollMonthTeacher) => {
    if (!teacher.sheet) return;
    try {
      const file = await orgApi.downloadPayrollSheet(teacher.sheet.id, sheetFileName(teacher.teacher_name, month));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(payrollErrorText(cause as { status?: number; code?: string; message?: string }), "error");
    }
  };

  const openSheet = (teacher: PayrollMonthTeacher) => {
    if (!teacher.sheet || !confirmLeave(dirty, UNSAVED_TEXT)) return;
    router.push(`/owner/payroll/${encodeURIComponent(teacher.sheet.id)}`);
  };

  if (denied || failure?.forbidden) return <PayrollForbidden />;

  const previewList = Object.values(previews);
  const active = activeId ? previews[activeId] : undefined;
  const activeExisting = activeId ? teachers.find((teacher) => teacher.teacher_id === activeId)?.sheet ?? null : null;
  const nextDisabled = !canGoToNextMonth(month, today);

  return (
    <div className="mx-auto w-full min-w-0 max-w-[1400px] space-y-5 print:max-w-none print:space-y-3">
      <style>{"@page { size: A4 landscape; margin: 10mm; }"}</style>

      <div className="min-w-0 print:hidden">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Зарплата</h1>
        <p className="text-sm text-slate-500">Ведомости преподавателей: проценты по типам занятий и расчёт за месяц</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between print:hidden">
        <nav aria-label="Месяц" className="flex items-center gap-1 self-start rounded-xl border border-slate-200 bg-white p-1">
          <button
            type="button"
            aria-label="Предыдущий месяц"
            onClick={() => goToMonth(shiftMonth(month, -1))}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="min-w-[10.5rem] px-2 text-center text-sm font-semibold text-slate-900" aria-live="polite">{monthTitle(month)}</span>
          <button
            type="button"
            aria-label="Следующий месяц"
            onClick={() => goToMonth(shiftMonth(month, 1))}
            disabled={nextDisabled}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void downloadMonth()}
            disabled={savedCount === 0 || exporting}
            title={savedCount === 0 ? "Сначала сохраните хотя бы одну ведомость" : undefined}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Скачать Excel за месяц
          </button>
          <button
            type="button"
            onClick={() => void calculate()}
            disabled={!overview || teachers.length === 0 || calculating}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
            {calculateButtonLabel(teachers, selected)}
          </button>
        </div>
      </div>

      {monthOpen && (
        <p role="status" className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 print:hidden">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span><span className="font-semibold">Месяц ещё не закончился.</span> Расчёт предварительный: уроки до конца месяца ещё могут появиться или измениться.</span>
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
            <div className={`hidden border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${GRID}`}>
              <span>
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={() => setSelected(allSelected ? new Set() : new Set(teachers.map((teacher) => teacher.teacher_id)))}
                  aria-label="Выбрать всех преподавателей"
                  className="h-4 w-4 accent-primary-600"
                />
              </span>
              <span>Преподаватель</span>
              <span>Процент по типам занятий</span>
              <span>Статус</span>
              <span>Предупреждения</span>
              <span />
            </div>
            <ul className="space-y-3 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {teachers.map((teacher) => (
                <TeacherRow
                  key={teacher.teacher_id}
                  teacher={teacher}
                  typed={typed}
                  showErrors={showErrors}
                  selected={selected.has(teacher.teacher_id)}
                  calculating={calculating}
                  onToggle={() => toggle(teacher.teacher_id)}
                  onType={(lessonType, text) => setType(teacher.teacher_id, lessonType, text)}
                  onCalculate={() => void calculate(teacher.teacher_id)}
                  onOpen={() => openSheet(teacher)}
                  onExport={() => void downloadSheet(teacher)}
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
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <Printer className="h-4 w-4" />
                Печать
              </button>
              <button
                type="button"
                onClick={closePreviews}
                className="inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
                Закрыть предпросмотр
              </button>
            </div>
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
            <p className="flex flex-wrap items-center gap-x-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700 print:hidden">
              <span>У преподавателя уже есть сохранённая ведомость ({revisionLabel(activeExisting.revision)}): сохранение создаст новую редакцию.</span>
              <Link href={`/owner/payroll/${encodeURIComponent(activeExisting.id)}`} className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline">
                Открыть сохранённую <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </p>
          )}
          {active.conflict && (
            <ConflictBanner
              message={payrollErrorText({ status: 409 })}
              reloading={active.saving}
              onReload={() => void refreshPreview(active.sheet.teacher_id)}
            />
          )}

          <PercentEditor
            sheet={active.sheet}
            edits={active.edits}
            onEdits={(update) => updateEdits(active.sheet.teacher_id, update)}
          />
          <PayrollSheetTable
            sheet={active.sheet}
            edits={active.edits}
            onEdits={(update) => updateEdits(active.sheet.teacher_id, update)}
          />
          <SaveBar
            dirty={editsDirty(active.edits)}
            problem={editsProblem(active.sheet, active.edits) ?? active.error}
            saveLabel={activeExisting ? `Сохранить как редакцию ${activeExisting.revision + 1}` : "Сохранить ведомость"}
            canSaveClean
            saving={active.saving}
            note={active.note}
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

export function TeacherRow({
  teacher, typed, showErrors, selected, calculating, onToggle, onType, onCalculate, onOpen, onExport,
}: {
  teacher: PayrollMonthTeacher;
  typed: Record<string, string>;
  showErrors: boolean;
  selected: boolean;
  calculating: boolean;
  onToggle: () => void;
  onType: (lessonType: string, text: string) => void;
  onCalculate: () => void;
  onOpen: () => void;
  onExport: () => void;
}) {
  const status = sheetStatus(teacher.sheet);
  const items: RowMenuItem[] = [
    { key: "calculate", label: "Рассчитать", icon: Calculator, onSelect: onCalculate, disabled: calculating },
    ...(teacher.sheet
      ? [
          { key: "open", label: "Открыть ведомость", icon: FileText, onSelect: onOpen },
          { key: "export", label: "Скачать Excel", icon: Download, onSelect: onExport },
        ]
      : []),
  ];

  return (
    <li className={`rounded-2xl border border-slate-200 bg-white p-4 xl:rounded-none xl:border-0 xl:px-5 xl:py-4 ${GRID}`}>
      <div className="flex items-start justify-between gap-3 xl:contents">
        <label className="flex min-w-0 items-start gap-3 xl:contents">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            aria-label={`Выбрать: ${teacher.teacher_name}`}
            className="mt-1 h-4 w-4 shrink-0 accent-primary-600"
          />
          <span className="min-w-0 break-words text-sm font-semibold text-slate-900 xl:mt-0.5">{teacher.teacher_name}</span>
        </label>
        <span className="xl:hidden">
          <RowMenu items={items} label={`Действия: ${teacher.teacher_name}`} busy={false} />
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-start gap-x-4 gap-y-2 xl:mt-0">
        {teacher.lesson_types.length === 0 ? (
          <span className="text-xs text-slate-400">нет типов занятий</span>
        ) : (
          teacher.lesson_types.map((type) => {
            const key = percentKey(teacher.teacher_id, type.lesson_type);
            const text = monthPercentText(typed, teacher, type.lesson_type);
            const error = showErrors || key in typed ? parsePercent(text).error : null;
            const id = `payroll-percent-${key.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
            return (
              <div key={type.lesson_type} className="min-w-0">
                <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-slate-500">{lessonTypeLabel(type.lesson_type)}</label>
                <div className="flex items-center gap-1.5">
                  <input
                    id={id}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    required
                    value={text}
                    placeholder="0"
                    aria-label={`Процент для ${teacher.teacher_name}, ${lessonTypeLabel(type.lesson_type)}`}
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => onType(type.lesson_type, event.target.value)}
                    className={`w-[4.5rem] rounded-lg border bg-white px-2.5 py-1.5 text-right text-sm tabular-nums outline-none focus:ring-2 ${
                      error ? "border-rose-300 focus:border-rose-500 focus:ring-rose-500/10" : "border-slate-200 focus:border-primary-500 focus:ring-primary-500/10"
                    }`}
                  />
                  <span className="text-sm text-slate-500">%</span>
                </div>
                {error && <p id={`${id}-error`} className="mt-1 max-w-[11rem] text-[11px] font-medium text-rose-700">{error}</p>}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 min-w-0 space-y-1.5 xl:mt-0">
        <StatusChip status={status} />
        {status.detail && <p className="text-xs text-slate-500">{status.detail}</p>}
        {teacher.sheet && (
          <p>
            <Link href={`/owner/payroll/${encodeURIComponent(teacher.sheet.id)}`} className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline">
              Открыть ведомость <ExternalLink className="h-3 w-3" />
            </Link>
          </p>
        )}
      </div>

      <ul aria-label={`Предупреждения: ${teacher.teacher_name}`} className="mt-3 space-y-1 xl:mt-0">
        {teacher.warnings.length === 0 ? (
          <li className="text-xs text-slate-400">нет</li>
        ) : (
          teacher.warnings.map((warning, index) => {
            const view = warningView(warning);
            const tone = view.tone === "warning" ? "text-amber-800" : "text-slate-600";
            return (
              <li key={`${warning.code}-${index}`} className={`flex items-start gap-1.5 text-xs ${tone}`}>
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                {view.href ? (
                  <Link href={view.href} className="font-medium underline-offset-2 hover:underline">{view.text}</Link>
                ) : (
                  <span>{view.text}</span>
                )}
              </li>
            );
          })
        )}
      </ul>

      <div className="hidden xl:block">
        <RowMenu items={items} label={`Действия: ${teacher.teacher_name}`} busy={false} />
      </div>
    </li>
  );
}
