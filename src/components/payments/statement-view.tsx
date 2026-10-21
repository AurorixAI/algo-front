"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, ChevronLeft, ChevronRight, FileSpreadsheet, HelpCircle, Loader2, Pencil, Printer, Receipt, ScrollText, Wallet, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { saveBlobAs } from "@/lib/download";
import {
  formatDateRu,
  formatMoney,
  receiptHref,
  type StatementOut,
} from "@/lib/payments";
import {
  BALANCE_TEXT_CLASS,
  buildStatementItems,
  monthRange,
  monthTitle,
  shiftMonthKey,
  statementDiff,
  statementFileName,
  statementMonths,
  statementReconciles,
  statementRowView,
  statementTotals,
  STATEMENT_HINTS,
  upcomingLine,
  type StatementEntry,
  type StatementItem,
} from "@/lib/payments-ledger";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { canGoBack, clearReceiptNavigationMark, markReceiptNavigation, receiptNavigationMarked } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { Hint } from "@/components/ui/hint";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { PaymentDialog, type EditablePayment } from "./payment-dialog";
import { PaymentVoidModal, type VoidablePayment } from "./payment-void-modal";
import { RecordVoidModal, type VoidTarget } from "./record-void-modal";

/** Date · operation · charged · paid · balance: a bank statement.  Every column but the operation is centred. */
const GRID = "md:grid md:grid-cols-[96px_minmax(0,1fr)_112px_112px_128px_40px] md:items-start md:gap-x-4";

const TOTAL_TONE = {
  debt: "text-rose-700",
  advance: "text-emerald-700",
  none: "text-slate-900",
  plain: "text-slate-900",
} as const;

const BUTTON = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium";

/**
 * «Выписка»: the account of one student in one group like a bank statement - Дата | Операция | Начислено | Оплачено | Остаток.
 * Charges are told in words (the month, the part of it, the price and where the price comes from), a payment says how it
 * was made and where each part of it went («за август — 69 000 (август закрыт)»), write-offs, refunds and transfers carry a
 * tag.  A light row per month sums it up; the switcher shows one month (with the balance carried in) or all of them.
 * Print and Excel (built by the server).  Shared by /owner/payments/statement/[id] and /admin/….
 */
export function StatementView({ paymentsHref }: { /** The payments page of this workspace: where «Назад» goes when there is no page of ours to go back to. */ paymentsHref: string }) {
  const params = useParams();
  const router = useRouter();
  const membershipId = String(params?.id ?? "");
  const paymentsBase = paymentsHref.replace(/\/+$/, "");

  const available = usePaymentsSummary((state) => state.available);
  const summaryLoaded = usePaymentsSummary((state) => state.loaded);
  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const noRight = summaryLoaded && !available;
  const { showToast, toastNode } = useToast();

  const [statement, setStatement] = useState<StatementOut | null>(null);
  const [failure, setFailure] = useState<{ message: string; retry: boolean } | null>(null);
  const [loading, setLoading] = useState(true);
  /** `YYYY-MM` of the month on screen; null = every month. */
  const [month, setMonth] = useState<string | null>(null);
  const [withVoided, setWithVoided] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requests = useRef(createRequestSequence());

  const [correct, setCorrect] = useState<EditablePayment | null>(null);
  const [voidPayment, setVoidPayment] = useState<VoidablePayment | null>(null);
  const [voidRecord, setVoidRecord] = useState<VoidTarget | null>(null);

  // The whole statement is read once: the month is cut here, so the balance after every row stays the server's.
  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getStatement(membershipId, { include_voided: withVoided });
      if (!requests.current.isCurrent(token)) return;
      setStatement(data);
    } catch (cause) {
      if (!requests.current.isCurrent(token)) return;
      const status = (cause as { status?: number } | null)?.status;
      setStatement(null);
      setFailure({
        message: status === 403
          ? "Нет доступа к выписке. Доступ даёт владелец центра в настройках."
          : status === 404 ? "Выписка не найдена. Возможно, ссылка устарела." : cause instanceof Error ? cause.message : "Не удалось загрузить выписку",
        retry: !status || status >= 500,
      });
    } finally {
      if (requests.current.isCurrent(token)) setLoading(false);
    }
  }, [membershipId, withVoided]);

  useEffect(() => {
    if (!membershipId || noRight) return;
    void load();
    return () => { requests.current.next(); };
  }, [membershipId, noRight, load]);

  // The title becomes the default file name when the user saves the page as PDF.
  useEffect(() => {
    if (!statement) return;
    const previous = document.title;
    document.title = `Выписка — ${statement.membership.student_name} — ${statement.membership.group_name}`;
    return () => { document.title = previous; };
  }, [statement]);

  const changed = () => {
    void load(true);
    void refreshSummary(true);
  };

  const goBack = () => {
    const inApp = canGoBack({
      historyLength: window.history.length,
      referrer: document.referrer,
      origin: window.location.origin,
      cameFromApp: receiptNavigationMarked(membershipId),
    });
    clearReceiptNavigationMark();
    if (inApp) router.back();
    else router.push(paymentsHref);
  };

  const exportExcel = async () => {
    if (!statement || exporting) return;
    setExporting(true);
    try {
      const range = month ? monthRange(month) : {};
      const file = await orgApi.exportStatement(membershipId, { ...range, include_voided: withVoided }, statementFileName(statement));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Не удалось скачать Excel", "error");
    } finally {
      setExporting(false);
    }
  };

  const months = useMemo(() => (statement ? statementMonths(statement) : []), [statement]);

  const rowMenu = (entry: StatementEntry): RowMenuItem[] => {
    const item = entry.raw;
    const items: RowMenuItem[] = [];
    if (entry.type === "payment" && item.details.payment_id) {
      const id = item.details.payment_id;
      if (item.details.receipt_no) {
        items.push({
          key: "receipt", label: "Квитанция", icon: Receipt,
          onSelect: () => { markReceiptNavigation(id); router.push(receiptHref(paymentsBase, id)); },
        });
      }
      items.push({
        key: "correct", label: "Исправить", icon: Pencil,
        onSelect: () => setCorrect({ id, amount: item.credit, paid_on: item.date, note: item.details.note, method: item.details.method ?? undefined }),
      });
      items.push({
        key: "void", label: "Отменить", icon: XCircle, danger: true,
        onSelect: () => setVoidPayment({ id, paid_on: item.date, amount: item.credit }),
      });
    }
    if (entry.type === "writeoff" && item.details.writeoff_id) {
      const id = item.details.writeoff_id;
      items.push({
        key: "void", label: "Отменить списание", icon: XCircle, danger: true,
        onSelect: () => setVoidRecord({
          key: id,
          title: "Отменить списание?",
          description: `${formatDateRu(item.date)} · ${formatMoney(item.credit)}`,
          explain: "Списанная сумма снова станет долгом. Запись останется в выписке серым с этой причиной.",
          action: "Отменить списание",
          run: async (reason) => { await orgApi.voidWriteoff(id, reason); showToast("Списание отменено"); changed(); },
        }),
      });
    }
    if (entry.type === "refund" && item.details.refund_id) {
      const id = item.details.refund_id;
      items.push({
        key: "void", label: "Отменить возврат", icon: XCircle, danger: true,
        onSelect: () => setVoidRecord({
          key: id,
          title: "Отменить возврат?",
          description: `${formatDateRu(item.date)} · ${formatMoney(item.outflow)}`,
          explain: "Деньги снова считаются у центра: сумма вернётся в аванс ученика. Запись останется в выписке серым с этой причиной.",
          action: "Отменить возврат",
          run: async (reason) => { await orgApi.voidRefund(id, reason); showToast("Возврат отменён"); changed(); },
        }),
      });
    }
    return items;
  };

  const message = noRight ? "Нет доступа к выписке. Доступ даёт владелец центра в настройках." : failure?.message ?? null;
  const m = statement?.membership;

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-5 print:max-w-none print:space-y-3">
      <style>{"@page { margin: 12mm; }"}</style>

      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button type="button" onClick={goBack} className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        {statement && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void exportExcel()} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-slate-400" />}
              Excel
            </button>
            <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700">
              <Printer className="h-4 w-4" />
              Печать
            </button>
          </div>
        )}
      </div>

      {loading && !statement ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500 print:hidden">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : message ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-14 text-center print:hidden">
          {noRight ? <Wallet className="h-7 w-7 text-slate-300" /> : <AlertCircle className="h-7 w-7 text-rose-500" />}
          <p className="text-sm font-medium text-slate-700">{message}</p>
          {!noRight && failure?.retry && (
            <button type="button" onClick={() => void load()} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          )}
        </div>
      ) : statement && m ? (
        <>
          <StatementHeader statement={statement} />

          {/* Month switcher */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 print:hidden" data-testid="statement-months">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonth((current) => shiftMonthKey(current ?? months[months.length - 1], -1))}
                disabled={month !== null && month <= months[0]}
                aria-label="Предыдущий месяц"
                className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[9rem] text-center text-sm font-semibold text-slate-900" aria-live="polite">{month ? monthTitle(month) : "Все месяцы"}</span>
              <button
                type="button"
                onClick={() => setMonth((current) => shiftMonthKey(current ?? months[0], 1))}
                disabled={month === null || month >= months[months.length - 1]}
                aria-label="Следующий месяц"
                className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMonth(null)}
              aria-pressed={month === null}
              className={`${BUTTON} ${month === null ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Все месяцы
            </button>
            <label className="ml-auto flex items-center gap-2 py-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={withVoided} onChange={(event) => setWithVoided(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-primary-600" />
              Показать отменённые
            </label>
          </div>

          <StatementTimeline statement={statement} menuFor={rowMenu} withVoided={withVoided} month={month} />
        </>
      ) : null}

      <PaymentDialog
        open={correct !== null}
        kind="replace"
        membership={correct && m ? { membership_id: m.membership_id, student_name: m.student_name, group_name: m.group_name } : null}
        payment={correct}
        onClose={() => setCorrect(null)}
        onSaved={() => { showToast("Оплата исправлена"); changed(); }}
        onDuplicate={() => { showToast("Эта оплата уже внесена"); changed(); }}
      />
      <PaymentVoidModal
        payment={voidPayment}
        studentName={m?.student_name}
        onClose={() => setVoidPayment(null)}
        onVoided={() => { showToast("Оплата отменена"); changed(); }}
      />
      <RecordVoidModal target={voidRecord} onClose={() => setVoidRecord(null)} />
      {toastNode}
    </div>
  );
}

/** A «?» with what a figure is (a bubble, reachable without hover). */
function Help({ text, label }: { text: string; label: string }) {
  return (
    <Hint text={text} className="inline-flex text-slate-400 print:hidden">
      <HelpCircle className="h-3.5 w-3.5" aria-label={label} />
    </Hint>
  );
}

/** The title, who and which group, and the tiles: Начислено · Оплачено · Остаток (+ Списано / Возвращено when there are some). */
export function StatementHeader({ statement }: { statement: StatementOut }) {
  const m = statement.membership;
  const totals = statementTotals(statement.summary);
  const reconciles = statementReconciles(statement.summary);
  return (
    <>
      <header>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Выписка</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          <span className="font-semibold text-slate-900">{m.student_name}</span>
          {m.display_id && <span className="ml-1.5 font-mono text-xs text-slate-500">ID {m.display_id}</span>}
          <span className="text-slate-300"> · </span>
          {m.group_name}
          {m.teacher_name && <span className="text-slate-500"> · {m.teacher_name}</span>}
        </p>
        <p className="text-xs text-slate-500">
          По состоянию на {formatDateRu(statement.as_of)}, учёт ведётся с {formatDateRu(statement.accounting_start)}, суммы в сумах
          {!m.is_active && " · ученик больше не в этой группе"}
        </p>
      </header>

      <section aria-label="Итоги" className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 print:rounded-none print:border-slate-400">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-10">
          {totals.map((total) => (
            <div key={total.key} className={total.key === "balance" ? "lg:ml-auto" : ""}>
              <dt className="flex items-center gap-1 text-xs text-slate-500">
                {total.label}
                {total.hint && <Help text={total.hint} label={`Что значит «${total.label}»`} />}
              </dt>
              <dd className={`tabular-nums ${total.key === "balance" ? "text-lg font-bold" : "text-sm font-semibold"} ${TOTAL_TONE[total.tone]}`}>{total.text}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs ${reconciles ? "text-emerald-700" : "font-medium text-rose-700"}`} data-testid="statement-reconciles">
          {reconciles ? <Check className="h-3.5 w-3.5" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
          <span className="font-semibold">{reconciles ? "Сходится" : `Не сходится: расхождение ${formatMoney(Math.abs(statementDiff(statement.summary)))}`}</span>
          <Help text={STATEMENT_HINTS.reconciles} label="Как проверяется «Сходится»" />
        </p>
      </section>
    </>
  );
}

/** The bank statement: a light row per month, then the rows of the month; the periods to come and the cancelled records below. */
export function StatementTimeline({
  statement, menuFor, withVoided, month = null,
}: {
  statement: StatementOut;
  menuFor: (entry: StatementEntry) => RowMenuItem[];
  withVoided: boolean;
  month?: string | null;
}) {
  const items = buildStatementItems(statement, month);
  const cancelled = statement.voided.map(statementRowView);
  const hasRows = statement.rows.length > 0;
  return (
    <>
      {!hasRows ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-12 text-center">
          <ScrollText className="h-6 w-6 text-slate-300" aria-hidden />
          <p className="text-sm font-medium text-slate-700">В выписке пока нет записей</p>
          <p className="max-w-sm text-xs text-slate-500">Начисления появятся, когда начнётся первый период, оплаты — после первой оплаты.</p>
        </div>
      ) : (
        <section aria-label="Записи счёта" className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white print:border-slate-400">
          <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-center text-[13px] font-semibold text-slate-500 ${GRID} md:items-center`}>
            <span>Дата</span>
            <span className="text-left">Операция</span>
            <span>Начислено</span>
            <span>Оплачено</span>
            <span>Остаток</span>
            <span className="sr-only">Действия</span>
          </div>
          <ol className="space-y-2.5 md:space-y-0 md:divide-y md:divide-slate-100">
            {items.map((item, index) => <StatementItemRow key={`${item.kind}-${index}-${"seq" in item ? item.seq : ""}`} item={item} menuFor={menuFor} />)}
          </ol>
        </section>
      )}

      {statement.upcoming.length > 0 && !month && (
        <section aria-label="Следующие периоды" className="text-sm">
          <h2 className="text-xs font-semibold text-slate-500">Следующие периоды (ещё не начались)</h2>
          <ul className="mt-1 space-y-0.5 text-slate-700">
            {statement.upcoming.map((segment) => <li key={segment.id} className="tabular-nums">{upcomingLine(segment)}</li>)}
          </ul>
        </section>
      )}

      {withVoided && (
        <section aria-label="Отменённые записи" className="text-sm">
          <h2 className="text-xs font-semibold text-slate-500">Отменённые записи</h2>
          {cancelled.length === 0 ? (
            <p className="mt-1 text-xs text-slate-400">Отменённых записей нет</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3.5">
              {cancelled.map((view) => (
                <li key={`${view.seq}-${view.type}-x`} className="py-2 text-xs text-slate-400">
                  <p>
                    <span className="tabular-nums">{formatDateRu(view.date)}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="line-through">{view.title}</span>
                    <span className="ml-2 tabular-nums">{view.effect}</span>
                  </p>
                  {view.cancelNote && <p className="text-slate-500">{view.cancelNote}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

function StatementItemRow({ item, menuFor }: { item: StatementItem; menuFor: (entry: StatementEntry) => RowMenuItem[] }) {
  if (item.kind === "month") {
    return (
      <li className="rounded-xl bg-slate-100 px-3.5 py-2 text-sm md:rounded-none md:bg-slate-50 md:px-4" data-testid="statement-month">
        <span className="font-semibold text-slate-800">{item.title}</span>
        <span className="text-slate-300"> · </span>
        <span className="text-slate-600">{item.summary}</span>
      </li>
    );
  }
  if (item.kind === "carry") {
    return (
      <li className={`rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm md:rounded-none md:border-0 md:bg-transparent md:px-4 ${GRID} md:items-center`} data-testid="statement-carry">
        <span className="hidden md:block" />
        <span className="text-slate-600">{item.text.replace(/: .*$/, "")}</span>
        <span className="hidden md:block" />
        <span className="hidden md:block" />
        <span className={`text-sm tabular-nums md:text-center ${BALANCE_TEXT_CLASS[item.balance.kind]}`}>{item.balance.text}</span>
        <span className="hidden md:block" />
      </li>
    );
  }
  return <StatementRowItem entry={item} menu={menuFor(item)} />;
}

const PAID_TONE = "text-emerald-700";

function StatementRowItem({ entry, menu }: { entry: StatementEntry; menu: RowMenuItem[] }) {
  const paidText = entry.paid === null ? "" : entry.paid < 0 ? `−${formatMoney(-entry.paid).replace(/ сум$/, "")}` : formatMoney(entry.paid).replace(/ сум$/, "");
  const chargedText = entry.charged === null ? "" : formatMoney(entry.charged).replace(/ сум$/, "");
  return (
    <li
      className={`rounded-xl border border-slate-200 bg-white p-3.5 md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-3 print:break-inside-avoid ${GRID}`}
      data-testid={`statement-row-${entry.type}`}
    >
      <p className="text-xs tabular-nums text-slate-500 md:text-center md:text-sm md:text-slate-700">{formatDateRu(entry.date)}</p>

      <div className="mt-1 min-w-0 md:mt-0">
        <p className="break-words text-sm font-medium text-slate-900">{entry.title}</p>
        {entry.sub && <p className="break-words text-xs text-slate-500">{entry.sub}</p>}
        {entry.replaced && <p className="text-xs font-medium text-amber-800">{entry.replaced}</p>}
        {entry.allocations.length > 0 && (
          <ul aria-label="Куда пошли деньги" className="mt-1 space-y-px border-l-2 border-slate-100 pl-2.5 text-xs text-slate-600">
            {entry.allocations.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
          </ul>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 md:mt-0 md:block md:text-center">
        <span className="text-xs text-slate-400 md:hidden">Начислено</span>
        <span className="text-sm tabular-nums text-slate-900">{chargedText}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 md:block md:text-center">
        <span className="text-xs text-slate-400 md:hidden">Оплачено</span>
        <span className="text-sm tabular-nums">
          <span className={entry.paid !== null && entry.paid < 0 ? "text-slate-800" : PAID_TONE}>{paidText}</span>
          {entry.tag && <span className="ml-1.5 inline-block rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px align-middle text-[10px] font-semibold text-slate-600 md:ml-0 md:mt-0.5 md:block md:w-fit md:mx-auto">{entry.tag}</span>}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-3 md:block md:text-center">
        <span className="text-xs text-slate-400 md:hidden">Остаток</span>
        <span className={`text-sm tabular-nums ${BALANCE_TEXT_CLASS[entry.balance.kind]}`}>{entry.balance.text}</span>
      </div>

      <div className="mt-1 flex justify-end md:mt-0 print:hidden">
        {menu.length > 0 ? <RowMenu items={menu} label={`Действия: ${entry.title}`} width={220} /> : <span className="hidden h-8 w-8 md:block" aria-hidden />}
      </div>
    </li>
  );
}
