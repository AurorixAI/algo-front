"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ChevronDown, Loader2 } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatUtcNaiveAsBusinessDateTime } from "@/lib/business-time";
import {
  formatPrice,
  GROUP_PRICE_ANCHOR,
  groupCancelledLine,
  historyViews,
  priceLabelOf,
  scheduledPriceLines,
  sinceText,
  type GroupPriceBrief,
  type GroupPriceResult,
  type GroupPrices,
  type HistoryItemView,
} from "@/lib/group-price";
import { createRequestSequence } from "@/lib/request-sequence";
import { GroupPriceCancelDialog } from "./group-price-cancel-dialog";
import { GroupPriceDialog } from "./group-price-dialog";

interface GroupPriceBlockProps {
  groupId: string;
  groupName: string;
  onNotify: (text: string, type?: "success" | "error" | "warning", details?: string[]) => void;
  /** The price today after a save (null: none), so the page keeps `price_current` of the group in step. */
  onChanged?: (current: GroupPriceBrief | null) => void;
  /** Classes of the section: the page places the line under the title of the group. */
  className?: string;
}

const STATUS_TAG: Record<HistoryItemView["status"], { text: string; className: string } | null> = {
  current: { text: "действует", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  future: { text: "ожидает даты", className: "border-amber-200 bg-amber-50 text-amber-800" },
  past: null,
};

/**
 * «Цена» of the group page (owner, and an administrator the owner gave money to; the page renders it only when the
 * group carries `price_current`): one compact line under the title of the group - the price today, since when, «Изменить
 * цену» - a small line for a price that starts later, and the history (with the cancellation of a scheduled price) behind
 * «История цены».  A 403 of the server (the right was taken away meanwhile) removes the block silently.
 */
export function GroupPriceBlock({ groupId, groupName, onNotify, onChanged, className = "" }: GroupPriceBlockProps) {
  const [data, setData] = useState<GroupPrices | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /** The scheduled row the owner is about to take back. */
  const [cancelTarget, setCancelTarget] = useState<HistoryItemView | null>(null);
  const requests = useRef(createRequestSequence());

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await orgApi.getGroupPrices(groupId);
      if (!requests.current.isCurrent(token)) return;
      setData(result);
      onChanged?.(result.current ? { amount: result.current.amount, valid_from: result.current.valid_from } : null);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      if (status === 403) setDenied(true);
      else setError(cause instanceof Error ? cause.message : "Не удалось загрузить цену");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
    // `onChanged` is the page's setter: it must not restart the read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  useEffect(() => {
    void load();
    return () => { requests.current.next(); };
  }, [load]);

  // The link «задать цену» of a list leads here (`#price`): the block exists only after the answer came.
  const scrolled = useRef(false);
  useEffect(() => {
    if (!data || scrolled.current || typeof window === "undefined") return;
    scrolled.current = true;
    if (window.location.hash === `#${GROUP_PRICE_ANCHOR}`) {
      document.getElementById(GROUP_PRICE_ANCHOR)?.scrollIntoView({ block: "center" });
    }
  }, [data]);

  if (denied) return null;

  const label = data?.price_label ?? priceLabelOf("calendar");
  const current = data?.current ?? null;
  const upcoming = scheduledPriceLines(data?.history, data?.as_of);
  const history = data ? historyViews(data.history, label, formatUtcNaiveAsBusinessDateTime) : [];

  const saved = (result: GroupPriceResult) => {
    if (result.current && result.history) {
      setData((previous) => (previous ? {
        ...previous,
        as_of: result.as_of ?? previous.as_of,
        price_label: result.price_label ?? previous.price_label,
        current: result.current,
        history: result.history ?? previous.history,
        cancelled: result.cancelled ?? previous.cancelled,
      } : previous));
      onChanged?.({ amount: result.current.amount, valid_from: result.current.valid_from });
    } else {
      void load(true);
    }
    onNotify("Цена группы сохранена");
  };

  return (
    <section
      id={GROUP_PRICE_ANCHOR}
      aria-label="Цена группы"
      className={`scroll-mt-4 ${className}`}
    >
      {loading && !data ? (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" />Загрузка цены…</p>
      ) : error && !data ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-rose-700">
          <AlertCircle className="h-4 w-4" aria-hidden="true" />
          {error}
          <button type="button" onClick={() => void load()} className="font-semibold underline">Повторить</button>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
            {current ? (
              <>
                <span className="font-semibold tabular-nums text-slate-900" data-testid="group-price-current">{formatPrice(current.amount, label)}</span>
                <span className="text-slate-500">{sinceText(current.valid_from)}</span>
              </>
            ) : (
              <span className="font-medium text-amber-800" data-testid="group-price-current">Цена не задана</span>
            )}
            {data && (
              <button
                type="button"
                onClick={() => setDialogOpen(true)}
                className="font-medium text-primary-700 hover:underline"
              >
                {current ? "Изменить цену" : "Задать цену"}
              </button>
            )}
            {data && (history.length > 0 || (data.cancelled ?? []).length > 0) && (
              <button
                type="button"
                onClick={() => setHistoryOpen((value) => !value)}
                aria-expanded={historyOpen}
                className="inline-flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800"
              >
                История цены
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${historyOpen ? "rotate-180" : ""}`} aria-hidden="true" />
              </button>
            )}
          </div>
          {!current && (
            <p className="mt-0.5 max-w-xl text-xs text-slate-500">
              Пока цены нет, сумма оплаты не подсказывается, а зарплата по ученикам группы не считается.
            </p>
          )}
          {upcoming.length > 0 && (
            <p className="mt-0.5 text-xs text-slate-600">Запланировано: {upcoming.join("; ")}</p>
          )}
        </>
      )}

      {data && historyOpen && (history.length > 0 || (data.cancelled ?? []).length > 0) && (
        <div className="mt-2 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-1">
          <ol aria-label="История цены" className="divide-y divide-slate-100">
            {history.map((item) => {
              const tag = STATUS_TAG[item.status];
              return (
                <li key={item.id} className="py-2 text-xs">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-800">
                    <span className="font-semibold tabular-nums">{item.amount}</span>
                    <span className="text-slate-500">{item.since}</span>
                    {tag && <span className={`rounded-md border px-1.5 py-px text-[10px] font-semibold ${tag.className}`}>{tag.text}</span>}
                  </p>
                  {item.note && <p className="break-words text-slate-600">{item.note}</p>}
                  {item.changes.map((line) => <p key={line} className="text-slate-500">{line}</p>)}
                  {item.author && <p className="text-[11px] text-slate-400">{item.author}</p>}
                  {item.status === "future" && (
                    <button type="button" onClick={() => setCancelTarget(item)} className="mt-1 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline">
                      Отменить
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
          {(data.cancelled ?? []).length > 0 && (
            <div className="border-t border-slate-100 py-2">
              <p className="text-[11px] font-semibold text-slate-400">Отменённые</p>
              <ul aria-label="Отменённые цены" className="mt-1 space-y-0.5">
                {data.cancelled.map((item, index) => <li key={index} className="text-xs text-slate-500">{groupCancelledLine(item)}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      <GroupPriceCancelDialog
        groupId={groupId}
        groupName={groupName}
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onRefused={() => void load(true)}
        onDone={(prices) => {
          setData(prices);
          onChanged?.(prices.current ? { amount: prices.current.amount, valid_from: prices.current.valid_from } : null);
          onNotify("Запланированная цена отменена");
        }}
      />

      <GroupPriceDialog
        open={dialogOpen}
        groupId={groupId}
        groupName={groupName}
        label={label}
        current={current}
        history={data?.history ?? []}
        onClose={() => setDialogOpen(false)}
        onSaved={saved}
        onConflict={() => void load(true)}
      />
    </section>
  );
}
