"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowLeftRight, Ban, CalendarDays, Check, ChevronLeft, ChevronRight, FileSpreadsheet, HeartHandshake, HelpCircle, History, Loader2, PauseCircle, Pencil, PencilLine, Receipt, ScrollText, Undo2, Wallet, XCircle, type LucideIcon } from "lucide-react";
import { orgApi } from "@/lib/api";
import { saveBlobAs } from "@/lib/download";
import { formatBusinessDate } from "@/lib/business-time";
import {
  formatDateRu,
  formatMoney,
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  receiptHref,
  type StatementOut,
} from "@/lib/payments";
import { basesOfPayments, groupHref, queryWith, studentHref } from "@/lib/ia-links";
import {
  BALANCE_TEXT_CLASS,
  balanceChipClass,
  buildStatementItems,
  defaultStatementMonth,
  monthRange,
  parseStatementMonth,
  resolveStatementMonth,
  shiftMonthKey,
  STATEMENT_ALIGN,
  STATEMENT_AMOUNT_CLASS,
  STATEMENT_ICON_TONE,
  STATEMENT_PAID_CLASS,
  statementChargedText,
  statementIconKind,
  statementMonthLabel,
  statementMonthParam,
  statementPaidText,
  type StatementIconKind,
  type StatementMonthChoice,
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
import { savedPaymentDetails } from "@/lib/payments-ledger";
import { useToast } from "@/components/ui/toast";
import { PaymentDialog, type EditablePayment } from "./payment-dialog";
import { PaymentVoidModal, type VoidablePayment } from "./payment-void-modal";
import { usePaymentCheques } from "./payment-cheques";
import { RecordVoidModal, type VoidTarget } from "./record-void-modal";

/**
 * Date · operation · charged · paid · balance: a bank statement.  Date and money are centred, the operation is left.
 * The three money columns are a band: a thin divider on the left of each and a very light background, the same in the header,
 * the rows and the month rows.  No gap between the columns: every cell pads itself, so a divider runs the full height of a row.
 */
const GRID = "md:grid md:grid-cols-[104px_minmax(0,1fr)_128px_128px_160px_48px] md:items-stretch";
const CELL_DATE = "md:px-2 md:py-3";
const CELL_OPERATION = "md:px-3 md:py-3";
const CELL_MONEY = "md:border-l md:border-slate-100 md:bg-slate-50/60 md:px-3 md:py-3";
/** The same band in the header and in the month rows (those rows are tinted, so the band is a little darker there). */
const HEAD_MONEY = "md:border-l md:border-slate-100 md:bg-slate-100/70 md:px-3 md:py-2.5";

const TOTAL_TONE = {
  debt: "text-rose-700",
  advance: "text-emerald-700",
  none: "text-slate-900",
  plain: "text-slate-900",
} as const;

/** One wording of the two actions on a payment, here and in the list of «Оплаты» (IA audit F11). */
export const CORRECT_PAYMENT_LABEL = "Исправить оплату";
export const VOID_PAYMENT_LABEL = "Отменить оплату";

const BUTTON = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium";

/**
 * «Выписка»: the account of one student in one group like a bank statement - Дата | Операция | Стоимость | Оплачено | Баланс.
 * Charges are told in words (the month, the part of it, the price and where the price comes from), a payment says how it
 * was made and where each part of it went («за август — 69 000 (август закрыт)»), write-offs, refunds and transfers carry a
 * tag.  A light row per month names it; the switcher shows one month (with a line about the balance carried in) or all of them.
 * Excel (built by the server) follows the month on screen.  Shared by /owner/payments/statement/[id] and /admin/….
 */
export function StatementView(props: { /** The payments page of this workspace: where «Назад» goes when there is no page of ours to go back to. */ paymentsHref: string }) {
  // The statement reads `?month=` (IA audit F34), so it needs a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary-500" /></div>}>
      <StatementViewContent {...props} />
    </Suspense>
  );
}

function StatementViewContent({ paymentsHref }: { paymentsHref: string }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  /**
   * What the address / the user chose: null = nothing yet (the statement opens on the current month, or the latest month with
   * rows), `all` = every month, `YYYY-MM` = that month.  `?month=` names it (IA audit F34).
   */
  const [choice, setChoice] = useState<StatementMonthChoice>(() => parseStatementMonth(searchParams?.get("month")));
  // the month on screen is in the address (`?month=2026-10`, `?month=all`); the opening choice leaves the path plain
  const setMonth = (next: StatementMonthChoice) => {
    setChoice(next);
    const value = statementMonthParam(next);
    router.replace(`${pathname}${queryWith(searchParams?.toString(), { month: value })}`.replace(/\?$/, ""), { scroll: false });
  };
  const [withVoided, setWithVoided] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requests = useRef(createRequestSequence());

  const [correct, setCorrect] = useState<EditablePayment | null>(null);
  const [payOpen, setPayOpen] = useState(false);
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
      const file = await orgApi.exportStatement(membershipId, { ...range, include_voided: withVoided }, statementFileName(statement, month));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Не удалось скачать Excel", "error");
    } finally {
      setExporting(false);
    }
  };

  const months = useMemo(() => (statement ? statementMonths(statement) : []), [statement]);
  const currentMonth = formatBusinessDate().slice(0, 7);
  /** The month on screen; null = every month. */
  const month = statement ? resolveStatementMonth(choice, statement, currentMonth) : null;
  const openingMonth = statement ? defaultStatementMonth(statement, currentMonth) : currentMonth;
  // IA audit F10: the cheques of the payments (attach / open / delete) live here now: this statement is the one history of the payments.
  const cheques = usePaymentCheques({ membershipId, enabled: Boolean(membershipId) && !noRight, onNotify: showToast });
  const bases = basesOfPayments(paymentsBase);

  const rowMenu = (entry: StatementEntry): RowMenuItem[] => {
    const item = entry.raw;
    const items: RowMenuItem[] = [];
    if (entry.type === "payment" && item.details.payment_id) {
      const id = item.details.payment_id;
      if (item.details.receipt_no) {
        items.push({
          key: "receipt", label: "Квитанция", icon: Receipt,
          onSelect: () => { markReceiptNavigation(id); router.push(receiptHref(paymentsBase, id, { membershipId, studentId: statement?.membership.student_id, groupId: statement?.membership.group_id })); },
        });
      }
      const attach = cheques.menuItem(id);
      if (attach) items.push(attach);
      // «Исправить» needs a running membership (a group the student has left keeps its payments, they can only be cancelled)
      if (statement?.membership.is_active) {
        items.push({
          key: "correct", label: CORRECT_PAYMENT_LABEL, icon: Pencil,
          onSelect: () => setCorrect({ id, amount: item.credit, paid_on: item.date, note: item.details.note, method: item.details.method ?? undefined }),
        });
      }
      items.push({
        key: "void", label: VOID_PAYMENT_LABEL, icon: XCircle, danger: true,
        onSelect: () => setVoidPayment({ id, paid_on: item.date, amount: item.credit }),
      });
    }
    if (entry.type === "writeoff" && item.details.writeoff_id) {
      const id = item.details.writeoff_id;
      items.push({
        key: "void", label: "Отменить прощение", icon: XCircle, danger: true,
        onSelect: () => setVoidRecord({
          key: id,
          title: "Отменить прощение долга?",
          description: `${formatDateRu(item.date)} · ${formatMoney(item.credit)}`,
          explain: "Прощённая сумма снова станет долгом. Запись останется в выписке серым с этой причиной.",
          action: "Отменить прощение",
          run: async (reason) => { await orgApi.voidWriteoff(id, reason); showToast("Прощение долга отменено"); changed(); },
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
    <div className="mx-auto w-full max-w-[1100px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={goBack} className="inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </button>
        {statement && (
          <div className="flex flex-wrap items-center gap-2">
            {statement.membership.is_active && (
              <button type="button" onClick={() => setPayOpen(true)} data-testid="statement-pay" className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-50">
                <Wallet className="h-4 w-4" />
                {PAY_ACTION_LABEL}
              </button>
            )}
            <button type="button" onClick={() => void exportExcel()} disabled={exporting} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-slate-400" />}
              Excel
            </button>
          </div>
        )}
      </div>

      {loading && !statement ? (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-primary-600" />
          Загрузка…
        </div>
      ) : message ? (
        <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-2 py-14 text-center">
          {noRight ? <Wallet className="h-7 w-7 text-slate-300" /> : <AlertCircle className="h-7 w-7 text-rose-500" />}
          <p className="text-sm font-medium text-slate-700">{message}</p>
          {!noRight && failure?.retry && (
            <button type="button" onClick={() => void load()} className="mt-1 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
          )}
        </div>
      ) : statement && m ? (
        <>
          <StatementHeader statement={statement} studentLink={studentHref(bases.students, m.student_id, "payments")} groupLink={groupHref(bases.groups, m.group_id)} />

          {/* Month switcher */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="statement-months">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setMonth(month === null ? openingMonth : shiftMonthKey(month, -1))}
                disabled={month !== null && month <= months[0]}
                aria-label="Предыдущий месяц"
                className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className={`min-w-[9rem] text-center text-sm ${month ? "font-semibold text-slate-900" : "text-slate-400"}`} aria-live="polite">{month ? statementMonthLabel(month) : "Выберите месяц"}</span>
              <button
                type="button"
                onClick={() => setMonth(month === null ? openingMonth : shiftMonthKey(month, 1))}
                disabled={month !== null && month >= months[months.length - 1]}
                aria-label="Следующий месяц"
                className="rounded-lg border border-slate-200 bg-white p-2 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setMonth(month === null ? null : "all")}
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

          <StatementTimeline statement={statement} menuFor={rowMenu} extraFor={(entry) => (entry.type === "payment" ? cheques.filesOf(entry.raw.details.payment_id) : null)} withVoided={withVoided} month={month} />
        </>
      ) : null}

      <PaymentDialog
        open={correct !== null}
        kind="replace"
        membership={correct && m ? { membership_id: m.membership_id, student_name: m.student_name, group_name: m.group_name } : null}
        payment={correct}
        onClose={() => setCorrect(null)}
        onSaved={() => { showToast("Оплата исправлена"); changed(); void cheques.reload(); }}
        onDuplicate={() => { showToast("Эта оплата уже внесена"); changed(); }}
      />
      <PaymentVoidModal
        payment={voidPayment}
        studentName={m?.student_name}
        onClose={() => setVoidPayment(null)}
        onVoided={() => { showToast("Оплата отменена"); changed(); void cheques.reload(); }}
      />
      <RecordVoidModal target={voidRecord} onClose={() => setVoidRecord(null)} />
      <PaymentDialog
        open={payOpen}
        kind="create"
        membership={m ? { membership_id: m.membership_id, group_id: m.group_id, student_name: m.student_name, group_name: m.group_name } : null}
        payment={null}
        groupsBasePath={bases.groups}
        onClose={() => setPayOpen(false)}
        onSaved={(result) => { showToast(PAYMENT_SAVED_TEXT.create, "success", savedPaymentDetails(result.allocation)); changed(); void cheques.reload(); }}
        onDuplicate={() => { showToast("Эта оплата уже внесена"); changed(); }}
      />
      {cheques.dialogs}
      {toastNode}
    </div>
  );
}

/** A «?» with what a figure is (a bubble, reachable without hover). */
function Help({ text, label }: { text: string; label: string }) {
  return (
    <Hint text={text} className="inline-flex text-slate-400">
      <HelpCircle className="h-3.5 w-3.5" aria-label={label} />
    </Hint>
  );
}

/** The title, who and which group, and the tiles: Стоимость обучения · Оплачено · Баланс (+ Прощено / Возвращено when there are some). */
export function StatementHeader({ statement, studentLink, groupLink }: {
  statement: StatementOut;
  /** The card of the student on its «Оплаты» tab and the page of the group: the statement is no dead end (IA audit F28). */
  studentLink?: string;
  groupLink?: string;
}) {
  const m = statement.membership;
  const totals = statementTotals(statement.summary);
  const reconciles = statementReconciles(statement.summary);
  return (
    <>
      <header>
        <h1 className="text-xl font-bold text-slate-900 md:text-2xl">Выписка</h1>
        <p className="mt-0.5 text-sm text-slate-600">
          {studentLink ? (
            <Link href={studentLink} data-testid="statement-student-link" className="font-semibold text-slate-900 hover:text-primary-700 hover:underline">{m.student_name}</Link>
          ) : (
            <span className="font-semibold text-slate-900">{m.student_name}</span>
          )}
          {m.display_id && <span className="ml-1.5 font-mono text-xs text-slate-500">ID {m.display_id}</span>}
          <span className="text-slate-300"> · </span>
          {groupLink ? (
            <Link href={groupLink} data-testid="statement-group-link" className="hover:text-primary-700 hover:underline">{m.group_name}</Link>
          ) : m.group_name}
          {m.teacher_name && <span className="text-slate-500"> · {m.teacher_name}</span>}
        </p>
        <p className="text-xs text-slate-500">
          По состоянию на {formatDateRu(statement.as_of)}, учёт ведётся с {formatDateRu(statement.accounting_start)}, суммы в сумах
          {!m.is_active && " · ученик больше не в этой группе"}
        </p>
      </header>

      <section aria-label="Итоги" className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
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
  statement, menuFor, extraFor, withVoided, month = null,
}: {
  statement: StatementOut;
  menuFor: (entry: StatementEntry) => RowMenuItem[];
  /** Under the operation of a row: the cheques attached to a payment. */
  extraFor?: (entry: StatementEntry) => ReactNode;
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
          <p className="max-w-sm text-xs text-slate-500">Стоимость появится, когда начнётся первый период, оплаты — после первой оплаты.</p>
        </div>
      ) : (
        <section aria-label="Записи счёта" className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white">
          <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 text-[13px] font-semibold text-slate-500 ${GRID}`}>
            <span className={`${CELL_DATE} ${STATEMENT_ALIGN.date}`}>Дата</span>
            <span className={`${CELL_OPERATION} ${STATEMENT_ALIGN.operation}`}>Операция</span>
            <span className={`${HEAD_MONEY} ${STATEMENT_ALIGN.money}`}>Стоимость</span>
            <span className={`${HEAD_MONEY} ${STATEMENT_ALIGN.money}`}>Оплачено</span>
            <span className={`${HEAD_MONEY} ${STATEMENT_ALIGN.money}`}>Баланс</span>
            <span className="sr-only">Действия</span>
          </div>
          <ol className="space-y-2.5 md:space-y-0 md:divide-y md:divide-slate-100">
            {items.map((item, index) => <StatementItemRow key={`${item.kind}-${index}-${"seq" in item ? item.seq : ""}`} item={item} menuFor={menuFor} extraFor={extraFor} />)}
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
                    <span className="ml-2 tabular-nums">{view.effect.replace(/^[+\u2212]/, "")}</span>
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

const ROW_ICONS: Record<StatementIconKind, LucideIcon> = {
  charge: CalendarDays,
  payment: Wallet,
  correction: PencilLine,
  writeoff: HeartHandshake,
  refund: Undo2,
  transfer: ArrowLeftRight,
  void: Ban,
  opening: History,
  pause: PauseCircle,
};

/** The small round icon at the start of «Операция»: what kind of record the row is. */
export function StatementRowIcon({ entry }: { entry: Pick<StatementEntry, "type" | "cancelled" | "replaced"> }) {
  const kind = statementIconKind(entry);
  const Icon = ROW_ICONS[kind];
  return (
    <span data-testid="statement-row-icon" data-icon={kind} aria-hidden className={`mt-px inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${STATEMENT_ICON_TONE[kind]}`}>
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
    </span>
  );
}

/** The balance as a chip: the tone says debt / advance / zero, every chip has the same height. */
export function BalanceChip({ balance }: { balance: { kind: StatementEntry["balance"]["kind"]; text: string } }) {
  if (!balance.text) return null;
  return <span data-testid="statement-balance-chip" data-tone={balance.kind} className={balanceChipClass(balance.kind)}>{balance.text}</span>;
}

/** The three money columns of a row that has no money (a month row, a note): the band keeps running. */
function BandCells({ head = false }: { head?: boolean }) {
  const cell = head ? HEAD_MONEY : CELL_MONEY;
  return (
    <>
      <span className={`hidden ${cell}`} aria-hidden />
      <span className={`hidden ${cell}`} aria-hidden />
      <span className={`hidden ${cell}`} aria-hidden />
    </>
  );
}

function StatementItemRow({ item, menuFor, extraFor }: { item: StatementItem; menuFor: (entry: StatementEntry) => RowMenuItem[]; extraFor?: (entry: StatementEntry) => ReactNode }) {
  if (item.kind === "month") {
    return (
      <>
        <li className={`rounded-xl bg-slate-100 px-3.5 py-2 text-sm md:rounded-none md:bg-slate-50 md:p-0 ${GRID}`} data-testid="statement-month">
          <span className="font-semibold text-slate-800 md:col-span-2 md:px-4 md:py-2">{item.title}</span>
          <BandCells head />
          <span className="hidden md:block" aria-hidden />
        </li>
        {item.empty && (
          <li className={`px-1 py-1 text-sm text-slate-400 md:p-0 ${GRID}`} data-testid="statement-month-empty">
            <span className="md:col-span-2 md:px-4 md:py-3">В этом месяце записей нет</span>
            <BandCells />
            <span className="hidden md:block" aria-hidden />
          </li>
        )}
      </>
    );
  }
  if (item.kind === "carry") {
    // one quiet line: «С сентября перенесён аванс 508 000» (the amount in its tone); no date, no icon, nothing in the money columns
    return (
      <li className={`px-1 text-sm text-slate-500 md:p-0 ${GRID}`} data-testid="statement-carry">
        <span className="md:col-span-2 md:px-4 md:py-2">
          {item.lead} <span className={`font-medium ${BALANCE_TEXT_CLASS[item.balance.kind]}`}>{item.amount}</span>
        </span>
        <BandCells />
        <span className="hidden md:block" aria-hidden />
      </li>
    );
  }
  return <StatementRowItem entry={item} menu={menuFor(item)} extra={extraFor?.(item) ?? null} />;
}

function StatementRowItem({ entry, menu, extra }: { entry: StatementEntry; menu: RowMenuItem[]; extra: ReactNode }) {
  const paidText = statementPaidText(entry);
  const chargedText = statementChargedText(entry);
  return (
    <li
      className={`rounded-xl border border-slate-200 bg-white p-3.5 md:rounded-none md:border-0 md:bg-transparent md:p-0 ${GRID}`}
      data-testid={`statement-row-${entry.type}`}
    >
      <p className={`text-xs tabular-nums text-slate-500 md:text-sm md:leading-6 md:text-slate-700 ${CELL_DATE} ${STATEMENT_ALIGN.date}`}>{formatDateRu(entry.date)}</p>

      <div className={`mt-1 flex min-w-0 gap-2.5 md:mt-0 ${CELL_OPERATION} ${STATEMENT_ALIGN.operation}`}>
        <StatementRowIcon entry={entry} />
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium leading-6 text-slate-900">{entry.title}</p>
          {entry.sub && <p className="break-words text-xs text-slate-500">{entry.sub}</p>}
          {entry.replaced && <p className="text-xs font-medium text-amber-800">{entry.replaced}</p>}
          {entry.allocations.length > 0 && (
            <ul aria-label="Куда пошли деньги" className="mt-1 space-y-px border-l-2 border-slate-100 pl-2.5 text-xs text-slate-600">
              {entry.allocations.map((line, index) => <li key={`${line}-${index}`}>{line}</li>)}
            </ul>
          )}
          {extra}
        </div>
      </div>

      <div className={`mt-2 items-baseline justify-between gap-3 md:mt-0 md:block ${CELL_MONEY} ${STATEMENT_ALIGN.money} ${chargedText ? "flex" : "hidden md:block"}`} data-testid="statement-cell-charged">
        <span className="text-xs text-slate-400 md:hidden">Стоимость</span>
        <span className={`${STATEMENT_AMOUNT_CLASS} md:leading-6`}>{chargedText}</span>
      </div>

      <div className={`items-baseline justify-between gap-3 md:block ${CELL_MONEY} ${STATEMENT_ALIGN.money} ${paidText ? "flex" : "hidden md:block"}`} data-testid="statement-cell-paid">
        <span className="text-xs text-slate-400 md:hidden">Оплачено</span>
        <span className="text-sm tabular-nums md:block">
          <span className={`${STATEMENT_PAID_CLASS} md:leading-6`}>{paidText}</span>
          {entry.tag && <span className="ml-1.5 inline-block rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px align-middle text-[10px] font-semibold text-slate-600 md:mx-auto md:ml-auto md:mt-0.5 md:block md:w-fit">{entry.tag}</span>}
        </span>
      </div>

      <div className={`flex items-center justify-between gap-3 md:items-start md:justify-center ${CELL_MONEY} ${STATEMENT_ALIGN.money}`} data-testid="statement-cell-balance">
        <span className="text-xs text-slate-400 md:hidden">Баланс</span>
        <BalanceChip balance={entry.balance} />
      </div>

      <div className="mt-1 flex justify-end md:mt-0 md:items-start md:px-1 md:py-2">
        {menu.length > 0 ? <RowMenu items={menu} label={`Действия: ${entry.title}`} width={220} /> : <span className="hidden h-8 w-8 md:block" aria-hidden />}
      </div>
    </li>
  );
}
