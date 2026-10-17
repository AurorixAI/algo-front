"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronLeft, ChevronRight, Loader2, Pencil, Search, UserRound, Wallet, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { formatBusinessDate } from "@/lib/business-time";
import {
  addMonthMinusDay,
  billingPeriodEndOf,
  bucketCount,
  buildPaymentPayload,
  buildQuoteQuery,
  fixedDayChips,
  formatDateRu,
  formatMoney,
  isCarryOver,
  isPartialPeriod,
  lastPaymentLabel,
  paymentAmountLabel,
  PAYMENT_BUCKETS,
  parseBucket,
  PARTIAL_AMOUNT_PROMPT,
  PARTIAL_PERIOD_BADGE,
  QUOTE_FAILED_NOTE,
  quoteCaption,
  quoteLacksPrice,
  quotePrefill,
  quoteQueryKey,
  reformatMoneyTyping,
  formatMoneyInput,
  statusDetail,
  statusLabel,
  statusTone,
  STATUS_TONE_CLASS,
  validatePaymentForm,
  type MembershipPaymentRow,
  type PaymentBucket,
  type PaymentFormValues,
  type PaymentOut,
  type PaymentQuote,
  type PaymentSaveResult,
  type PaymentWarning,
  type PeriodMode,
} from "@/lib/payments";
import { FREE_WORD, groupPriceHref, membershipPriceView, priceLabelOf, priceOfRow, priceSourceTag } from "@/lib/group-price";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { usePaymentQuote } from "@/lib/use-payment-quote";
import { createRequestSequence } from "@/lib/request-sequence";
import { CascadingFilter } from "@/components/ui/cascading-filter";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { PaymentFormModal, type PaymentFormKind } from "./payment-form-modal";
import { PaymentVoidModal } from "./payment-void-modal";

const PAGE_SIZE = 50;

/** Column templates of the wide layout (cards below `xl`). */
const GRID_DEFAULT = "xl:grid xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_120px_minmax(0,1.4fr)_112px_124px] xl:items-center xl:gap-x-4";
const GRID_NONE = "xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,2.6fr)] xl:items-center xl:gap-x-4";

const FIELD = "w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

const EMPTY_TEXT: Record<PaymentBucket, string> = {
  due: "Нет учеников, которым пора платить",
  expiring: "Скоро заканчивающихся оплат нет",
  none: "У всех учеников есть данные об оплате",
  active: "Оплаченных учеников пока нет",
};

interface FormState {
  kind: PaymentFormKind;
  row: MembershipPaymentRow;
  payment: PaymentOut | null;
}

function warningLines(warnings: PaymentWarning[] | undefined): string[] {
  return (warnings || []).map((warning) => warning.message);
}

/** Runs `callback` once, when `ref` first comes into (or near) the viewport; at once where there is no observer. */
function useOnceVisible(ref: React.RefObject<Element | null>, callback: () => void): void {
  const done = useRef(false);
  const latest = useRef(callback);
  latest.current = callback;
  useEffect(() => {
    const node = ref.current;
    if (!node || done.current) return;
    const fire = () => { if (!done.current) { done.current = true; latest.current(); } };
    if (typeof IntersectionObserver === "undefined") { fire(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) { fire(); observer.disconnect(); }
    }, { rootMargin: "200px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
}

/**
 * Quick entry of a first payment right in the row of the «Нет данных» tab.  The sum is suggested from the price of the
 * group (or the individual price of the student); the price is never typed here - where there is none, the row says so,
 * links to the group and the amount of the payment is typed by hand.
 */
function QuickEntry({
  row, periodMode, lessonsDefault, groupsBasePath, onDone,
}: {
  row: MembershipPaymentRow;
  periodMode: PeriodMode;
  lessonsDefault: number | null;
  groupsBasePath: string;
  onDone: (row: MembershipPaymentRow, warnings: PaymentWarning[]) => void;
}) {
  const today = useMemo(() => formatBusinessDate(), []);
  const price = priceOfRow(row);
  const priceView = membershipPriceView(price, priceLabelOf(periodMode));
  const priceAmount = price.amount ?? null;
  // The amount of the payment: typed, else the suggestion of the server, else the price.
  const [amount, setAmount] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidOn, setPaidOn] = useState(today);
  const [validFrom, setValidFrom] = useState(today);
  const [validTo, setValidTo] = useState(() => addMonthMinusDay(today));
  const [toTouched, setToTouched] = useState(false);
  const [lessons, setLessons] = useState(lessonsDefault ? String(lessonsDefault) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The server is asked only for rows that have been in view: a long list does not fire a request per row.
  const [seen, setSeen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);
  useOnceVisible(formRef, () => setSeen(true));

  const query = useMemo(() => buildQuoteQuery({
    mode: periodMode, paidOn, validFrom, validTo, lessons, fromTouched: false, toTouched,
  }), [periodMode, paidOn, validFrom, validTo, lessons, toTouched]);
  const queryKey = quoteQueryKey(query);
  const quoteState = usePaymentQuote({
    enabled: seen,
    membershipId: row.membership_id,
    query,
    onQuote: (quote: PaymentQuote) => {
      // The period only: the amount of this row is derived below.
      const patch = quotePrefill(quote, { from: false, to: toTouched, amount: true }, periodMode);
      if (patch.validFrom) setValidFrom(patch.validFrom);
      if (patch.validTo) setValidTo(patch.validTo);
    },
  });
  const { quote, loading: quoteLoading, failed: quoteFailed } = quoteState;
  const fresh = quote && quoteState.quoteKey === queryKey ? quote : null;
  const fixedDay = periodMode === "calendar" && quote?.billing_anchor === "fixed_day" ? quote.billing_day : null;

  // No answer: the period is worked out here, from the payment date; the center's day is used once an answer has told it.
  useEffect(() => {
    if (!quoteFailed) return;
    setValidFrom(paidOn);
    if (!toTouched) setValidTo(fixedDay !== null ? billingPeriodEndOf(paidOn, fixedDay) : addMonthMinusDay(paidOn));
  }, [quoteFailed, paidOn]); // eslint-disable-line react-hooks/exhaustive-deps

  const suggestion = fresh !== null && fresh.suggested_amount !== null ? fresh.suggested_amount : null;
  // A period of an odd length has no price: the amount is stated by hand, not taken from the price.
  const custom = fresh?.basis === "custom";
  const partial = fresh ? fresh.partial : fixedDay !== null && isPartialPeriod(validFrom, validTo, fixedDay);
  // Never the full price for a part of a month: without a suggestion the field stays empty.
  const defaultAmount = custom ? null : suggestion ?? (partial ? null : priceAmount);
  const showAmount = amountTouched || custom || partial || priceAmount === null || (suggestion !== null && suggestion !== priceAmount);
  const amountText = amountTouched ? amount : formatMoneyInput(defaultAmount);
  const waiting = seen && quoteLoading && !(amountTouched && toTouched);
  const caption = quoteFailed
    ? QUOTE_FAILED_NOTE
    : partial && defaultAmount === null && !amountTouched
      ? PARTIAL_AMOUNT_PROMPT
      // «Цена группы не задана» is said (with the link) over the form already
      : fresh && !quoteLacksPrice(fresh) ? quoteCaption(fresh) : "";

  const changePaidOn = (value: string) => {
    setError(null);
    setPaidOn(value);
    // With one center day the server knows the period: the dates wait for its answer.
    if (fixedDay) return;
    setValidFrom(value);
    if (!toTouched && value) setValidTo(addMonthMinusDay(value));
  };

  const changeValidTo = (value: string) => {
    setToTouched(true);
    setError(null);
    setValidTo(value);
  };

  const save = async () => {
    if (busy || waiting) return;
    const values: PaymentFormValues = {
      amount: amountText, paidOn, validFrom, validTo, lessons, note: "", reason: "",
    };
    const problem = validatePaymentForm(values, periodMode, today);
    if (problem) { setError(problem); return; }
    setBusy(true);
    setError(null);
    try {
      const result = await orgApi.createPayment(row.membership_id, buildPaymentPayload(values, periodMode));
      onDone(result.row, result.warnings || []);
    } catch (cause) {
      setError((cause instanceof Error ? cause.message : "Не удалось сохранить оплату").replace(/[.\s]+$/, ""));
      setBusy(false);
    }
  };

  const id = `quick-${row.membership_id}`;
  const chips = fixedDay !== null ? fixedDayChips(validFrom, validTo, fixedDay) : null;
  const chipClass = "rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors";
  return (
    <form
      ref={formRef}
      onSubmit={(event) => { event.preventDefault(); void save(); }}
      className="space-y-1.5"
      noValidate
    >
      <p className="text-xs" data-testid="quick-price">
        {priceView.kind === "none" ? (
          <>
            <span className="font-medium text-amber-800">{priceView.title}</span>
            {" · "}
            <Link href={groupPriceHref(groupsBasePath, row.group_id)} className="font-semibold text-primary-700 hover:underline">задать цену группы</Link>
            <span className="text-slate-500"> — сумму оплаты введите вручную</span>
          </>
        ) : (
          <span className="text-slate-600">{priceView.text}</span>
        )}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
        <div>
          <label htmlFor={`${id}-paid`} className="mb-0.5 block text-[11px] font-medium text-slate-500">Дата оплаты</label>
          <input id={`${id}-paid`} type="date" value={paidOn} max={today} onChange={(event) => changePaidOn(event.target.value)} className={FIELD} />
        </div>
        {periodMode === "calendar" ? (
          <div>
            <label htmlFor={`${id}-to`} className="mb-0.5 block text-[11px] font-medium text-slate-500">Оплачено до</label>
            <input id={`${id}-to`} type="date" value={validTo} onChange={(event) => changeValidTo(event.target.value)} className={FIELD} />
          </div>
        ) : (
          <div>
            <label htmlFor={`${id}-lessons`} className="mb-0.5 block text-[11px] font-medium text-slate-500">Уроков</label>
            <input
              id={`${id}-lessons`}
              type="number"
              min={1}
              inputMode="numeric"
              value={lessons}
              onChange={(event) => { setError(null); setLessons(event.target.value); }}
              placeholder="по настройке"
              className={FIELD}
            />
          </div>
        )}
        <button
          type="submit"
          disabled={busy || waiting}
          className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-700 disabled:opacity-60 sm:col-span-1"
        >
          {(busy || waiting) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Сохранить
        </button>
      </div>

      {chips && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Оплачено до: быстрый выбор">
          <button type="button" aria-pressed={validTo === chips.toEnd} onClick={() => changeValidTo(chips.toEnd)} className={`${chipClass} ${validTo === chips.toEnd ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            До конца месяца ({formatDateRu(chips.toEnd).slice(0, 5)})
          </button>
          <button type="button" aria-pressed={validTo === chips.plusNext} onClick={() => changeValidTo(chips.plusNext)} className={`${chipClass} ${validTo === chips.plusNext ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
            + следующий месяц ({formatDateRu(chips.plusNext).slice(0, 5)})
          </button>
        </div>
      )}

      {showAmount && (
        <div className="max-w-[14rem]">
          <label htmlFor={`${id}-amount`} className="mb-0.5 block text-[11px] font-medium text-slate-500">Сумма оплаты, сум</label>
          <input
            id={`${id}-amount`}
            value={amountText}
            onChange={(event) => { setError(null); setAmountTouched(true); setAmount(reformatMoneyTyping(event.target.value)); }}
            inputMode="numeric"
            autoComplete="off"
            placeholder="450 000"
            className={FIELD}
          />
        </div>
      )}

      <p aria-live="polite" className={`min-h-[1rem] text-[11px] ${quoteFailed && !waiting ? "text-amber-700" : "text-slate-500"}`}>
        {waiting ? (
          <span className="inline-flex items-center gap-1 text-slate-400"><Loader2 className="h-3 w-3 animate-spin" />Считаем сумму…</span>
        ) : caption}
        {!waiting && !quoteFailed && fresh?.partial && (
          <span className="ml-2 inline-flex rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 align-middle text-[11px] font-semibold text-amber-800">{PARTIAL_PERIOD_BADGE}</span>
        )}
      </p>
      {error && <p role="alert" className="text-xs font-medium text-rose-700">{error}</p>}
    </form>
  );
}

function PaymentsPageContent({ studentProfileBasePath, groupsBasePath }: { studentProfileBasePath: string; groupsBasePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bucket = parseBucket(searchParams?.get("bucket"));

  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const due = usePaymentsSummary((state) => state.due);
  const none = usePaymentsSummary((state) => state.none);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const lessonsDefault = usePaymentsSummary((state) => state.lessonsPerPayment);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);

  const { showToast, toastNode } = useToast();

  const [items, setItems] = useState<MembershipPaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filter, setFilter] = useState({ teacherId: "", groupId: "" });
  const [teachers, setTeachers] = useState<Array<{ id: string; first_name: string; last_name: string; full_name?: string }>>([]);
  const [groups, setGroups] = useState<Array<{ id: string; name: string; teacher_id: string }>>([]);

  const [form, setForm] = useState<FormState | null>(null);
  const [voidTarget, setVoidTarget] = useState<{ payment: PaymentOut; studentName: string } | null>(null);

  const requests = useRef(createRequestSequence());

  // The summary is also read by the layout; this keeps the page's own numbers fresh on entry.
  useEffect(() => { void refreshSummary(true); }, [refreshSummary]);

  useEffect(() => {
    const timer = setTimeout(() => { setDebouncedSearch(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Teacher -> group directory for the cascading filter; without it the list still works.
  useEffect(() => {
    let cancelled = false;
    Promise.all([orgApi.listMembers(), orgApi.listGroups()])
      .then(([members, groupList]) => {
        if (cancelled) return;
        setTeachers(
          (Array.isArray(members) ? members : [])
            .filter((m: any) => m.org_role === "teacher")
            .map((m: any) => ({
              id: m.user_id || m.id,
              first_name: m.first_name ?? "",
              last_name: m.last_name ?? "",
              full_name: m.full_name,
            })),
        );
        const list: any[] = Array.isArray(groupList) ? groupList : (groupList as any)?.items || [];
        setGroups(list.map((g) => ({ id: g.id, name: g.name, teacher_id: g.teacher_id })));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await orgApi.getPaymentsStatus({
        bucket,
        groupId: filter.groupId || undefined,
        teacherId: filter.groupId ? undefined : filter.teacherId || undefined,
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      if (!requests.current.isCurrent(token)) return;
      // The last row of a later page was handled: step back instead of showing an empty page.
      if ((data.items || []).length === 0 && page > 0) {
        setPage(Math.min(page - 1, Math.max(0, Math.ceil((data.total ?? 0) / PAGE_SIZE) - 1)));
        return;
      }
      setItems(data.items || []);
      setTotal(data.total ?? 0);
    } catch (error) {
      if (!requests.current.isCurrent(token)) return;
      const status = (error as { status?: number } | null)?.status;
      if (status === 403 || status === 404) setDenied(true);
      else setLoadError(error instanceof Error ? error.message : "Не удалось загрузить список");
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [bucket, debouncedSearch, filter.groupId, filter.teacherId, page]);

  useEffect(() => { void load(); }, [load]);

  const switchBucket = (next: PaymentBucket) => {
    setPage(0);
    router.replace(`?bucket=${next}`, { scroll: false });
  };

  /** A change of payments: the visible list and the shared numbers are re-read. */
  const afterChange = useCallback(() => {
    void load(true);
    void refreshSummary(true);
  }, [load, refreshSummary]);

  const onSaved = (_result: PaymentSaveResult) => {
    showToast(form?.kind === "replace" ? "Оплата исправлена" : "Оплата внесена");
    afterChange();
  };

  const onQuickDone = (row: MembershipPaymentRow, warnings: PaymentWarning[]) => {
    // The row has a status now: it leaves the «Нет данных» tab without reloading the page.
    setItems((previous) => previous.filter((item) => item.membership_id !== row.membership_id));
    setTotal((value) => Math.max(0, value - 1));
    if (warnings.length > 0) showToast("Оплата внесена", "warning", warningLines(warnings));
    else showToast("Оплата внесена");
    void refreshSummary(true);
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(debouncedSearch || filter.teacherId || filter.groupId);

  if (denied || (summaryLoaded && !available)) {
    return (
      <div className="flex flex-col items-center justify-center gap-1.5 py-20 text-center">
        <Wallet className="h-6 w-6 text-slate-300" />
        <p className="text-sm font-medium text-slate-700">Раздел «Оплаты» недоступен</p>
        <p className="text-xs text-slate-400">Доступ даёт владелец центра в настройках.</p>
      </div>
    );
  }

  const summaryForTabs = { due, none };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-5">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Оплаты</h1>
        <p className="text-sm text-slate-500">Кто из учеников оплатил занятия и когда оплата заканчивается</p>
      </div>

      {/* One row: tabs on the left, search and filter on the right */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 xl:w-fit" role="tablist">
          {PAYMENT_BUCKETS.map(({ key, label }) => {
            const count = bucketCount(summaryForTabs, key);
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={bucket === key}
                onClick={() => switchBucket(key)}
                className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${
                  bucket === key ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {count !== null && count > 0 ? `${label} (${count})` : label}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 xl:w-64 xl:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Имя или ID ученика"
              aria-label="Поиск по имени или ID ученика"
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
            />
          </div>
          <CascadingFilter
            teachers={teachers}
            groups={groups}
            value={filter}
            onChange={(value) => { setFilter(value); setPage(0); }}
          />
        </div>
      </div>

      {/* List */}
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
        <p className="py-14 text-center text-sm text-slate-400">{filtered ? "Ничего не найдено" : EMPTY_TEXT[bucket]}</p>
      ) : (
        <section className="xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white">
          {bucket !== "none" && (
            <div className={`hidden border-b border-slate-100 bg-slate-50 px-5 py-2.5 text-xs font-semibold uppercase tracking-wider text-slate-500 ${GRID_DEFAULT}`}>
              <span>Ученик</span>
              <span>Группа</span>
              <span>{priceLabelOf(periodMode)}</span>
              <span>Статус</span>
              <span>Последняя оплата</span>
              <span />
            </div>
          )}
          <ul className="space-y-2.5 xl:space-y-0 xl:divide-y xl:divide-slate-100">
            {items.map((row) => (
              <PaymentRow
                key={row.membership_id}
                row={row}
                bucket={bucket}
                periodMode={periodMode}
                lessonsDefault={lessonsDefault}
                studentProfileBasePath={studentProfileBasePath}
                groupsBasePath={groupsBasePath}
                onPay={() => setForm({ kind: row.last_payment ? "extend" : "create", row, payment: null })}
                onCorrect={(payment) => setForm({ kind: "replace", row, payment })}
                onVoid={(payment) => setVoidTarget({ payment, studentName: row.student_name })}
                onQuickDone={onQuickDone}
              />
            ))}
          </ul>
        </section>
      )}

      {!loading && !loadError && total > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3 text-sm text-slate-600">
          <span>Всего: {total}</span>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))} aria-label="Предыдущая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronLeft className="h-4 w-4" /></button>
            <span>{page + 1} из {pageCount}</span>
            <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)} aria-label="Следующая страница" className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 disabled:opacity-40"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}

      <PaymentFormModal
        open={form !== null}
        kind={form?.kind ?? "create"}
        membership={form ? {
          membership_id: form.row.membership_id,
          group_id: form.row.group_id,
          student_name: form.row.student_name,
          group_name: form.row.group_name,
          monthly_fee: priceOfRow(form.row).amount,
          paid_until: form.row.paid_until,
        } : null}
        payment={form?.payment ?? null}
        periodMode={periodMode}
        lessonsDefault={lessonsDefault}
        groupsBasePath={groupsBasePath}
        onClose={() => setForm(null)}
        onSaved={onSaved}
      />
      <PaymentVoidModal
        payment={voidTarget?.payment ?? null}
        studentName={voidTarget?.studentName}
        onClose={() => setVoidTarget(null)}
        onVoided={() => { showToast("Оплата отменена"); afterChange(); }}
      />

      {toastNode}
    </div>
  );
}

function PaymentRow({
  row, bucket, periodMode, lessonsDefault, studentProfileBasePath, groupsBasePath, onPay, onCorrect, onVoid, onQuickDone,
}: {
  row: MembershipPaymentRow;
  bucket: PaymentBucket;
  periodMode: PeriodMode;
  lessonsDefault: number | null;
  studentProfileBasePath: string;
  groupsBasePath: string;
  onPay: () => void;
  onCorrect: (payment: PaymentOut) => void;
  onVoid: (payment: PaymentOut) => void;
  onQuickDone: (row: MembershipPaymentRow, warnings: PaymentWarning[]) => void;
}) {
  const router = useRouter();
  const quick = bucket === "none";
  const tone = STATUS_TONE_CLASS[statusTone(row.status)];
  const detail = statusDetail(row);
  const last = row.last_payment && !row.last_payment.voided_at ? row.last_payment : null;
  const price = priceOfRow(row);
  const tag = priceSourceTag(price);

  const menu: RowMenuItem[] = [];
  if (last) {
    // A carry-over cannot be corrected (correct the payment it came from); cancelling it stays possible.
    if (!isCarryOver(last)) menu.push({ key: "correct", label: "Исправить последнюю оплату", icon: Pencil, onSelect: () => onCorrect(last) });
    menu.push({ key: "void", label: "Отменить последнюю оплату", icon: XCircle, danger: true, onSelect: () => onVoid(last) });
  }

  const openProfile = () => router.push(`${studentProfileBasePath}/${row.student_id}`);
  menu.push({ key: "profile", label: "Карточка ученика", icon: UserRound, onSelect: openProfile });

  const student = (
    <div className="min-w-0">
      <Link href={`${studentProfileBasePath}/${row.student_id}`} className="block break-words text-sm font-medium text-slate-900 hover:text-primary-700 xl:truncate" title="Открыть карточку ученика">
        {row.student_name}
      </Link>
      <p className="truncate text-xs text-slate-500">
        {[row.display_id, row.class_level ? `${row.class_level} класс` : ""].filter(Boolean).join(" · ")}
      </p>
    </div>
  );
  const group = (
    <div className="min-w-0">
      <p className="break-words text-sm text-slate-800 xl:truncate" title={row.group_name}>{row.group_name}</p>
      <p className="truncate text-xs text-slate-500">{row.teacher_name || "—"}</p>
    </div>
  );

  return (
    <li className={`flex flex-col gap-1.5 rounded-xl border border-slate-200 bg-white p-3.5 xl:gap-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-5 xl:py-2.5 ${quick ? GRID_NONE : GRID_DEFAULT}`}>
      {student}
      {group}

      {quick ? (
        <div className="mt-1.5 xl:mt-0">
          <QuickEntry row={row} periodMode={periodMode} lessonsDefault={lessonsDefault} groupsBasePath={groupsBasePath} onDone={onQuickDone} />
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3 text-sm xl:block">
            <span className="text-xs text-slate-400 xl:hidden">{priceLabelOf(periodMode)}</span>
            {price.amount === null || price.amount === undefined ? (
              <Link href={groupPriceHref(groupsBasePath, row.group_id)} className="text-xs font-medium text-amber-800 hover:underline" title="Открыть группу и задать цену">
                цена группы не задана
              </Link>
            ) : (
              <span className="text-right xl:text-left">
                <span className="font-medium tabular-nums text-slate-800">{price.amount === 0 ? FREE_WORD : formatMoney(price.amount)}</span>
                {tag && <span className="block text-[11px] text-primary-700" title={price.reason ?? undefined}>{tag}</span>}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 xl:block">
            <span className={`inline-block max-w-full rounded-md border px-2 py-0.5 text-xs font-medium leading-4 ${tone}`}>{statusLabel(row)}</span>
            {detail && <p className="text-xs text-slate-500">{detail}</p>}
          </div>

          <div className="flex items-baseline justify-between gap-3 text-xs text-slate-500 xl:block">
            <span className="shrink-0 text-slate-400 xl:hidden">Последняя оплата</span>
            {last ? (
              <span className="text-right tabular-nums xl:text-left" title={lastPaymentLabel(last)}>
                <span className="xl:block">{formatDateRu(last.paid_on)}</span>
                <span className="xl:hidden"> · </span>
                <span className="xl:block xl:text-slate-400">{paymentAmountLabel(last)}</span>
              </span>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </div>

          <div className="mt-1 flex items-center justify-end gap-1.5 xl:mt-0">
            <PayButton row={row} onPay={onPay} />
            <RowMenu items={menu} label={`Действия: ${row.student_name}`} />
          </div>
        </>
      )}
    </li>
  );
}

function PayButton({ row, onPay }: { row: MembershipPaymentRow; onPay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPay}
      className="flex-1 rounded-lg border border-primary-200 bg-white px-3 py-1.5 text-center text-xs font-semibold text-primary-700 hover:bg-primary-50 xl:flex-none"
    >
      {row.last_payment ? "Продлить" : "Внести"}
    </button>
  );
}

/**
 * «Оплаты»: who has paid and until when, for every student × group. Shared by /owner/payments and /admin/payments.
 * `groupsBasePath`: where the groups live - «цена группы не задана» links to the price of the group.
 */
export function PaymentsPage(props: { studentProfileBasePath: string; groupsBasePath: string }) {
  return (
    <Suspense
      fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}
    >
      <PaymentsPageContent {...props} />
    </Suspense>
  );
}
