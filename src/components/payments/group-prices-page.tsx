"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, History, Loader2, Search, Users, Wallet } from "lucide-react";
import { orgApi } from "@/lib/api";
import { lessonTypeLabel } from "@/lib/payroll";
import {
  filterGroupPrices,
  GROUP_PRICES_SEARCH_FROM,
  individualPricesText,
  priceCellText,
  priceColumnLabel,
  priceLabelOf,
  rowWithPrices,
  scheduledAsHistoryItem,
  scheduledCellText,
  sinceText,
  type GroupPriceList,
  type GroupPriceListItem,
  type GroupPriceResult,
  type GroupPrices,
  type HistoryItemView,
} from "@/lib/group-price";
import { individualPricesHref } from "@/lib/group-payments";
import { createRequestSequence } from "@/lib/request-sequence";
import { TableHeader } from "@/components/attendance/table-chrome";
import { useToast } from "@/components/ui/toast";
import { GroupPriceCancelDialog } from "@/components/groups/group-price-cancel-dialog";
import { GroupPriceDialog } from "@/components/groups/group-price-dialog";
import { GroupPriceHistoryModal } from "@/components/groups/group-price-history-modal";

/** Wide layout (xl): group · price · scheduled · individual prices · actions.  Below it the rows are cards. */
const GRID_COLS = "xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)_212px]";
const GRID = `xl:grid ${GRID_COLS} xl:items-center xl:gap-x-3`;

type Target = { item: GroupPriceListItem; mode: "edit" | "history" };

/**
 * «Оплаты -> Цены групп»: the price of every group of the centre in one table - the only place where it is set
 * (the group card shows no price line).  «Изменить цену» opens the dialog with the impact preview, «История цены» the
 * history (with the cancellation of a scheduled price); an individual price of one student stays in the student card.
 * Shared by /owner/payments/prices and /admin/payments/prices.
 */
function GroupPricesContent({ paymentsHref, groupsBasePath }: { paymentsHref: string; groupsBasePath: string }) {
  const { showToast, toastNode } = useToast();
  const params = useSearchParams();
  const focusId = params.get("group");
  const [data, setData] = useState<GroupPriceList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<Target | null>(null);
  /** The history of the group of `target` (read when the dialog is asked for). */
  const [prices, setPrices] = useState<GroupPrices | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [cancelRow, setCancelRow] = useState<GroupPriceListItem | null>(null);
  const requests = useRef(createRequestSequence());

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const result = await orgApi.listGroupPrices();
      if (!requests.current.isCurrent(token)) return;
      setData(result);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      if (status === 403 || status === 404) setDenied(true);
      else setLoadError(cause instanceof Error ? cause.message : "Не удалось загрузить цены групп");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requests.current.next(); };
  }, [load]);

  const patchRow = useCallback((groupId: string, change: (item: GroupPriceListItem) => GroupPriceListItem) => {
    setData((previous) => (previous ? { ...previous, items: previous.items.map((item) => (item.group_id === groupId ? change(item) : item)) } : previous));
  }, []);

  // The link «задать цену группы» of other screens leads here with `?group=`: that row is brought into view and marked.
  const [marked, setMarked] = useState<string | null>(null);
  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !focusId || scrolledTo.current === focusId) return;
    scrolledTo.current = focusId;
    if (!data.items.some((item) => item.group_id === focusId)) return;
    setMarked(focusId);
    document.querySelector(`[data-group-id="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: "center" });
    const timer = window.setTimeout(() => setMarked(null), 4000);
    return () => window.clearTimeout(timer);
  }, [data, focusId]);

  /** Reads the history of the group, then opens the dialog (`edit`) or the history (`history`). */
  const openFor = async (item: GroupPriceListItem, mode: Target["mode"]) => {
    if (busyId) return;
    setBusyId(item.group_id);
    try {
      const result = await orgApi.getGroupPrices(item.group_id);
      setPrices(result);
      setTarget({ item, mode });
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Не удалось загрузить цену группы", "error");
    } finally {
      setBusyId(null);
    }
  };

  const closeTarget = () => { setTarget(null); };

  const saved = (item: GroupPriceListItem, result: GroupPriceResult) => {
    if (result.current && result.history) {
      patchRow(item.group_id, (row) => rowWithPrices(row, { current: result.current, history: result.history }));
      setPrices((previous) => (previous ? {
        ...previous,
        as_of: result.as_of ?? previous.as_of,
        price_label: result.price_label ?? previous.price_label,
        current: result.current,
        history: result.history ?? previous.history,
        cancelled: result.cancelled ?? previous.cancelled,
      } : previous));
    } else {
      void load(true);
    }
    showToast(item.current ? "Цена группы изменена" : "Цена группы задана");
  };

  const changedByCancel = (item: GroupPriceListItem, next: GroupPrices) => {
    setPrices(next);
    patchRow(item.group_id, (row) => rowWithPrices(row, next));
  };

  const items = data?.items ?? [];
  const label = data?.price_label ?? priceLabelOf("calendar");
  const shown = useMemo(() => filterGroupPrices(items, search), [items, search]);
  const searchable = items.length >= GROUP_PRICES_SEARCH_FROM;

  if (denied) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
        <Wallet className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Раздел «Оплаты» недоступен</p>
        <p className="text-xs text-slate-400">Доступ даёт владелец центра в настройках.</p>
      </div>
    );
  }

  const row = (item: GroupPriceListItem) => (
    <PriceRow
      key={item.group_id}
      item={item}
      groupsBasePath={groupsBasePath}
      priceLabel={priceColumnLabel(label)}
      marked={marked === item.group_id}
      busy={busyId === item.group_id}
      onEdit={() => void openFor(item, "edit")}
      onHistory={() => void openFor(item, "history")}
      onCancel={() => setCancelRow(item)}
    />
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="min-w-0">
        <Link href={paymentsHref} className="mb-1.5 inline-flex items-center gap-0.5 text-sm font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Оплаты
        </Link>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Цены групп</h1>
        <p className="text-sm text-slate-500">Сколько стоит обучение в каждой группе, что запланировано и у кого цена индивидуальная</p>
      </div>

      {searchable && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Название группы"
            aria-label="Поиск по названию группы"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : loadError ? (
        <div role="alert" className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="max-w-md text-sm font-medium text-rose-800">{loadError}</p>
          <button type="button" onClick={() => void load()} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-14 text-center">
          <span className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400"><Users className="h-5 w-5" /></span>
          <p className="text-sm font-medium text-slate-700">Групп пока нет</p>
          <Link href={groupsBasePath} className="text-sm font-semibold text-primary-700 hover:underline">Перейти к группам</Link>
        </div>
      ) : shown.length === 0 ? (
        <p className="py-14 text-center text-sm text-slate-400">Ничего не найдено</p>
      ) : (
        <section aria-label="Цены групп" className="xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white">
          <TableHeader
            show="xl"
            gridClass={GRID_COLS}
            labels={["Группа", priceColumnLabel(label), "Запланировано", "Индивидуальные цены", ""]}
            aligns={["left", "center", "center", "center", "right"]}
          />
          <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">{shown.map(row)}</ul>
        </section>
      )}

      {target?.mode === "edit" && (
        <GroupPriceDialog
          open
          groupId={target.item.group_id}
          groupName={target.item.name}
          label={prices?.price_label ?? label}
          current={prices?.current ?? null}
          history={prices?.history ?? []}
          onClose={closeTarget}
          onSaved={(result) => saved(target.item, result)}
          onConflict={() => {
            void load(true);
            void orgApi.getGroupPrices(target.item.group_id).then(setPrices).catch(() => undefined);
          }}
        />
      )}
      <GroupPriceHistoryModal
        open={target?.mode === "history"}
        groupId={target?.item.group_id ?? ""}
        groupName={target?.item.name ?? ""}
        prices={prices}
        onClose={closeTarget}
        onChanged={(next) => target && changedByCancel(target.item, next)}
        onRefused={() => {
          void load(true);
          if (target) void orgApi.getGroupPrices(target.item.group_id).then(setPrices).catch(() => undefined);
        }}
        onNotify={showToast}
      />
      <GroupPriceCancelDialog
        groupId={cancelRow?.group_id ?? ""}
        groupName={cancelRow?.name ?? ""}
        target={cancelRow?.scheduled ? scheduledAsHistoryItem(cancelRow.scheduled, label) : null}
        onClose={() => setCancelRow(null)}
        onRefused={() => void load(true)}
        onDone={(next) => { if (cancelRow) patchRow(cancelRow.group_id, (row) => rowWithPrices(row, next)); showToast("Запланированная цена отменена"); }}
      />

      {toastNode}
    </div>
  );
}

function PriceRow({
  item, groupsBasePath, priceLabel, marked, busy, onEdit, onHistory, onCancel,
}: {
  item: GroupPriceListItem;
  groupsBasePath: string;
  priceLabel: string;
  marked: boolean;
  busy: boolean;
  onEdit: () => void;
  onHistory: () => void;
  onCancel: () => void;
}) {
  const price = priceCellText(item.current);
  const scheduled = scheduledCellText(item.scheduled);
  const individual = individualPricesText(item.students_with_override);
  const second = [item.teacher_name, item.kind !== "group" ? lessonTypeLabel(item.kind) : null].filter(Boolean).join(" · ");

  return (
    <li
      data-group-id={item.group_id}
      className={`flex flex-col gap-1.5 rounded-xl border bg-white p-3.5 transition-colors xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-4 xl:py-3 ${GRID} ${marked ? "border-primary-300 ring-2 ring-primary-100 xl:bg-primary-50/50" : "border-slate-200"}`}
    >
      <div className="min-w-0">
        <Link href={`${groupsBasePath.replace(/\/+$/, "")}/${encodeURIComponent(item.group_id)}`} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700 xl:truncate" title={item.name}>
          {item.name}
        </Link>
        {second && <p className="truncate text-xs text-slate-500">{second}</p>}
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm xl:block xl:text-center">
        <span className="text-xs text-slate-400 xl:hidden">{priceLabel}</span>
        {price ? (
          <span className="text-right xl:block xl:text-center">
            <span className="block font-medium tabular-nums text-slate-800" data-testid="group-price-current">{price}</span>
            <span className="block text-xs text-slate-500">{sinceText(item.current?.valid_from)}</span>
          </span>
        ) : (
          <span className="text-sm font-medium text-amber-700" data-testid="group-price-current">Не задана</span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm xl:block xl:text-center">
        <span className="shrink-0 text-xs text-slate-400 xl:hidden">Запланировано</span>
        {scheduled ? (
          <span className="text-right xl:block xl:text-center">
            <span className="block tabular-nums text-slate-800" data-testid="group-price-scheduled">{scheduled}</span>
            {item.scheduled_count > 1 && <span className="block text-xs text-slate-500">и ещё {item.scheduled_count - 1}</span>}
            <button type="button" onClick={onCancel} className="text-xs font-semibold text-slate-600 hover:text-slate-900 hover:underline">Отменить</button>
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-3 text-sm xl:block xl:text-center">
        <span className="shrink-0 text-xs text-slate-400 xl:hidden">Индивидуальные цены</span>
        {individual ? (
          // #126: «кто эти ученики» - the tab «Оплаты» of the group, filtered to the individual prices
          <Link href={individualPricesHref(groupsBasePath, item.group_id)} data-testid="group-individual-link" className="whitespace-nowrap font-medium text-primary-700 hover:underline" title="Показать, у кого индивидуальная цена">{individual}</Link>
        ) : <span className="text-slate-400">—</span>}
      </div>

      <div className="mt-1 flex items-center justify-end gap-1.5 xl:mt-0">
        <button
          type="button"
          onClick={onEdit}
          disabled={busy}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-60 xl:w-[7.5rem] xl:flex-none"
        >
          {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
          {item.current ? "Изменить цену" : "Задать цену"}
        </button>
        {/* IA audit F3: the history is an icon, not a «⋯» with one item */}
        <button
          type="button"
          onClick={onHistory}
          disabled={busy}
          aria-label={`История цены: ${item.name}`}
          title="История цены"
          data-testid="group-price-history"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 disabled:opacity-60"
        >
          <History className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </li>
  );
}

export function GroupPricesPage(props: { paymentsHref: string; groupsBasePath: string }) {
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <GroupPricesContent {...props} />
    </Suspense>
  );
}
