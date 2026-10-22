"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ClipboardList, Loader2, X } from "lucide-react";
import { orgApi } from "@/lib/api";
import {
  bannerText,
  bannerVisible,
  checklistOf,
  headerBadge,
  OPENINGS_TITLE,
  openingsHref,
  type ChecklistStep,
  type OpeningsSummary,
} from "@/lib/openings";
import { useOpeningsSummary } from "@/lib/openings-summary";

/**
 * The three small pieces of «Остатки на начало» that live on other screens (ROADMAP #125).  They are built here and wired by the
 * pages that own them: the header of «Оплаты» (`OpeningsHeaderLink`), the tab «Должники» (`OpeningsBanner`) and the block «Оплаты» of
 * the settings (`OpeningsChecklist`).  Each asks `GET /org/opening-balances/summary` (one request for all of them on a screen) and shows
 * nothing for a user without the right to money.
 */

/**
 * The notice above the list of debtors: «Остатки на начало не заполнены у 38 учеников — долги могут быть неточными» → «Заполнить» and
 * «Не нужно».  Shown only while the checklist is open (`pending`) and somebody is still missing; «Не нужно» ends it (state `skipped`).
 */
export function OpeningsBanner({ paymentsBase, summary: given }: { paymentsBase: string; /** For a page that already read the summary (and for tests); it asks itself otherwise. */ summary?: OpeningsSummary | null }) {
  const { summary: own, replace } = useOpeningsSummary();
  const summary = given !== undefined ? given : own;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!bannerVisible(summary)) return null;

  const skip = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      replace(await orgApi.setOpeningsState("skipped"));
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="status" data-testid="openings-banner" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700"><ClipboardList className="h-4 w-4" aria-hidden="true" /></span>
      <p className="min-w-0 flex-1 text-sm leading-5 text-slate-700" style={{ flexBasis: "14rem" }}>{bannerText(summary!.totals.missing)}</p>
      <div className="flex shrink-0 items-center gap-2">
        <Link href={openingsHref(paymentsBase)} data-testid="openings-banner-open" className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3.5 text-sm font-semibold text-white hover:bg-primary-700">Заполнить</Link>
        <button
          type="button"
          onClick={() => void skip()}
          disabled={busy}
          data-testid="openings-banner-skip"
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          Не нужно
        </button>
      </div>
      {failed && <p role="alert" className="basis-full text-xs font-medium text-rose-700">Не удалось сохранить ответ — попробуйте ещё раз</p>}
    </div>
  );
}

/** The button of the header of «Оплаты» (next to «Поступления» and «Цены групп»), with the number of the students still missing. */
export function OpeningsHeaderLink({ paymentsBase, summary: given }: { paymentsBase: string; summary?: OpeningsSummary | null }) {
  const { summary: own } = useOpeningsSummary();
  const summary = given !== undefined ? given : own;
  const badge = headerBadge(summary);
  return (
    <Link
      href={openingsHref(paymentsBase)}
      data-testid="openings-header-link"
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      <ClipboardList className="h-4 w-4 text-slate-400" aria-hidden="true" />
      {OPENINGS_TITLE}
      {badge !== null && (
        <span data-testid="openings-header-badge" aria-label={`Не заполнено: ${badge}`} className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-amber-800">{badge}</span>
      )}
    </Link>
  );
}

function StepMark({ status }: { status: ChecklistStep["status"] }) {
  return status === "done"
    ? <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" aria-label="Выполнено" />
    : <Circle className={`h-5 w-5 shrink-0 ${status === "current" ? "text-primary-600" : "text-slate-300"}`} aria-label={status === "current" ? "Сейчас" : "Впереди"} />;
}

/**
 * «Запуск учёта оплат» for the block «Оплаты» of the settings (owner): «Дата начала учёта → Остатки на начало → Готово».  Once the
 * first two steps are done the card folds into one line.  `onChangeDate` brings the owner to the field of the date (the page knows
 * where it is); without it the step has no button.
 */
export function OpeningsChecklist({ paymentsBase, onChangeDate, summary: given }: { paymentsBase: string; onChangeDate?: () => void; summary?: OpeningsSummary | null }) {
  const { summary: own } = useOpeningsSummary();
  const summary = given !== undefined ? given : own;
  const [expanded, setExpanded] = useState(false);
  if (!summary) return null;
  const checklist = checklistOf(summary);
  if (checklist.launched && checklist.line && !expanded) {
    return (
      <section aria-label="Запуск учёта оплат" data-testid="openings-checklist" className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-slate-800">{checklist.line}</p>
        <button type="button" onClick={() => setExpanded(true)} className="text-sm font-medium text-primary-700 hover:underline">Подробнее</button>
      </section>
    );
  }
  return (
    <section aria-label="Запуск учёта оплат" data-testid="openings-checklist" className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">Запуск учёта оплат</h3>
        {expanded && (
          <button type="button" onClick={() => setExpanded(false)} aria-label="Свернуть" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" aria-hidden="true" /></button>
        )}
      </div>
      <ol className="space-y-2.5">
        {checklist.steps.map((step, index) => (
          <li key={step.key} data-testid={`openings-step-${step.key}`} data-status={step.status} className="flex items-start gap-3">
            <StepMark status={step.status} />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <p className={`text-sm ${step.status === "todo" ? "text-slate-400" : "text-slate-800"}`}>
                <span className="text-slate-400">{index + 1}. </span>
                <span className="font-medium">{step.title}</span>
                {step.detail && <span className={step.status === "todo" ? "" : "text-slate-600"}> — {step.detail}</span>}
              </p>
              {step.action === "change_date" && onChangeDate && (
                <button type="button" onClick={onChangeDate} className="text-sm font-medium text-primary-700 hover:underline">Изменить</button>
              )}
              {step.action === "open" && (
                <Link href={openingsHref(paymentsBase)} data-testid="openings-step-open" className="text-sm font-semibold text-primary-700 hover:underline">Открыть →</Link>
              )}
              {step.action === "reopen" && (
                <Link href={openingsHref(paymentsBase)} data-testid="openings-step-open" className="text-sm font-medium text-primary-700 hover:underline">Вернуться к остаткам</Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
