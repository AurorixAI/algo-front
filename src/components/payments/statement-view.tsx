"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ArrowLeftRight, Ban, CalendarDays, ChevronLeft, ChevronRight, FileSpreadsheet, HeartHandshake, HelpCircle, History, Loader2, PauseCircle, Pencil, PencilLine, Receipt, ScrollText, Undo2, Wallet, XCircle, type LucideIcon } from "lucide-react";
import { orgApi } from "@/lib/api";
import { saveBlobAs } from "@/lib/download";
import { formatBusinessDate, shiftMonthKey } from "@/lib/business-time";
import {
  formatDateRu,
  formatMoney,
  PAY_ACTION_LABEL,
  PAYMENT_SAVED_TEXT,
  receiptHref,
  refundReceiptHref,
  type StatementOut,
} from "@/lib/payments";
import { serverEffectsRows, studentToast } from "@/lib/money-effects";
import { basesOfPayments, groupHref, queryWith, studentHref } from "@/lib/ia-links";
import {
  buildStatementItems,
  defaultStatementMonth,
  monthRange,
  parseStatementMonth,
  resolveStatementMonth,
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
  statementStates,
  statementTotals,
  STATEMENT_HINTS,
  upcomingLine,
  type StatementEntry,
  type StatementItem,
  type StatementState,
} from "@/lib/payments-ledger";
import { useMoneyDenied, usePaymentsSummary } from "@/lib/payments-summary";
import { canGoBack, clearReceiptNavigationMark, markReceiptNavigation, receiptNavigationMarked } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { Hint } from "@/components/ui/hint";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { savedPaymentDetails, savedPaymentToastDetails } from "@/lib/payments-ledger";
import { useToast } from "@/components/ui/toast";
import { PaymentDialog, type EditablePayment } from "./payment-dialog";
import { enteredLaterMark, recordedOnMark } from "@/lib/entered-later";
import { PaymentVoidModal, paymentRestoreTarget, type VoidablePayment } from "./payment-void-modal";
import { usePaymentCheques } from "./payment-cheques";
import { RecordVoidModal, type VoidTarget } from "./record-void-modal";
import { Checkbox } from "@/components/ui/checkbox";
import { DataCell, DataRow, DataSpanRow, DataTable, type DataColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PAY_STATE_TONE } from "@/lib/pay-state";
import type { OpenPart } from "@/lib/payments";

/** Date · operation · charged · paid · «Остаток» (what is open on the row ITSELF today, the server's words): a bank statement.  Text and the date LEFT, the three money columns CENTRED (their headers too), the actions («⋯») in their own ruled column. */
const STATEMENT_COLUMNS: DataColumn[] = [
  { key: "date", header: "Дата", width: "max-content" },
  { key: "operation", header: "Операция", width: "minmax(10rem,1fr)" },
  { key: "charged", header: "Стоимость", align: "center", numeric: "center", width: "max-content", cardLabel: "Стоимость" },
  { key: "paid", header: "Оплачено", align: "center", numeric: "center", width: "max-content", cardLabel: "Оплачено" },
  { key: "balance", header: "Остаток", align: "center", numeric: "center", width: "max-content", cardLabel: "Остаток" },
  { key: "menu", header: "", align: "center", ruled: true, width: "max-content", actions: true },
];

/** The tone of a big word of the state on the right of the summary: the debt is red, «К оплате» plain (the calm blue is the label's, a big blue sum reads as a link), paid and the advance green. */
const STATE_TONE: Record<StatementState["tone"], string> = {
  debt: "text-rose-700",
  due: "text-slate-900",
  paid: "text-emerald-700",
  advance: "text-emerald-700",
  plain: "text-slate-900",
};
const STATE_SUB_TONE: Record<StatementState["tone"], string> = { debt: "text-rose-700", due: "text-slate-500", paid: "text-slate-500", advance: "text-slate-500", plain: "text-slate-500" };

/** One wording of the two actions on a payment, here and in the list of «Оплаты» (IA audit F11). */
export const CORRECT_PAYMENT_LABEL = "Исправить оплату";
export const VOID_PAYMENT_LABEL = "Отменить оплату";

const BUTTON = "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium max-sm:min-h-10";

/**
 * «Выписка»: the account of one student in one group like a bank statement - Дата | Операция | Стоимость | Оплачено | Остаток.
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

  const refreshSummary = usePaymentsSummary((state) => state.refresh);
  const noRight = useMoneyDenied();
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
  // Money-2 T7: the cancelled payments the server lets be restored (`restorable` of the list of payments of the membership; the rows of the statement do not carry it)
  const [restorable, setRestorable] = useState<ReadonlySet<string>>(new Set());
  const [entered, setEntered] = useState<ReadonlyMap<string, string>>(new Map());

  // The whole statement is read once: the month is cut here, so the balance after every row stays the server's.
  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setFailure(null);
    try {
      const [data, payments] = await Promise.all([
        orgApi.getStatement(membershipId, { include_voided: withVoided }),
        orgApi.listMembershipPayments(membershipId, true).catch(() => []),
      ]);
      if (!requests.current.isCurrent(token)) return;
      setStatement(data);
      setRestorable(new Set(payments.filter((payment) => payment.restorable === true).map((payment) => payment.id)));
      // Money-2 Э9: the payments entered later than their day carry «внесено ДД.ММ»
      setEntered(new Map(payments.map((payment) => [payment.id, enteredLaterMark(payment.created_at, payment.paid_on)] as const).filter((pair): pair is [string, string] => pair[1] !== null)));
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
    if (!membershipId) return;
    // no right: nothing is asked and the loading ENDS (it stayed on «Загрузка…» for ever - the refusal below is drawn only after it)
    if (noRight) { setLoading(false); return; }
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
      // «Исправить» is there for a student who has left too (G3M С1): the server lets the method, the date and a SMALLER amount be corrected and answers
      // `PAYMENT_EXCEEDS_DEBT` in words; a payment that came over from another group is a «transfer» row, never this one
      items.push({
        key: "correct", label: CORRECT_PAYMENT_LABEL, icon: Pencil,
        onSelect: () => setCorrect({ id, amount: item.credit, paid_on: item.date, note: item.details.note, method: item.details.method ?? undefined, files: cheques.fileListOf(id) }),
      });
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
          title: "Отменить прощение?",
          description: `${formatDateRu(item.date)} · ${formatMoney(item.credit)}`,
          explain: "Прощённая сумма снова станет неоплаченной. Запись останется в выписке серым с этой причиной.",
          action: "Отменить прощение",
          // Money-1 V1: the debt the person SAW is checked by the server (a change in between is «Долг изменился: было …, сейчас …»)
          expected: statement?.summary.unpaid, expectedKind: "debt", emptyText: "Долга больше нет", onStale: changed,
          run: async (reason, expected) => { const result = await orgApi.voidWriteoff(id, reason, expected); const note = studentToast(); showToast("Прощение отменено", note.tone, note.details); changed(); },
        }),
      });
    }
    if (entry.type === "refund" && item.details.refund_id) {
      const id = item.details.refund_id;
      // Money-1 V6: the sheet «Квитанция о возврате В-n» (a refund older than the numbers has one without a number)
      items.push({
        key: "receipt", label: "Квитанция", icon: Receipt,
        onSelect: () => { markReceiptNavigation(id); router.push(refundReceiptHref(paymentsBase, id)); },
      });
      items.push({
        key: "void", label: "Отменить возврат", icon: XCircle, danger: true,
        onSelect: () => setVoidRecord({
          key: id,
          title: "Отменить возврат?",
          description: `${formatDateRu(item.date)} · ${formatMoney(item.outflow)}`,
          explain: "Деньги снова считаются у центра: сумма вернётся в аванс ученика. Запись останется в выписке серым с этой причиной.",
          action: "Отменить возврат",
          expected: statement?.summary.advance, expectedKind: "advance", emptyText: "Аванса больше нет", onStale: changed,
          run: async (reason, expected) => { const result = await orgApi.voidRefund(id, reason, expected); const note = studentToast(); showToast("Возврат отменён", note.tone, note.details); changed(); },
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
        <Button type="button" onClick={goBack} variant="ghost" size="sm">
          <ArrowLeft className="h-4 w-4" />
          Назад
        </Button>
        {statement && (
          <div className="flex flex-wrap items-center gap-2">
            {statement.membership.is_active && (
              <Button type="button" onClick={() => setPayOpen(true)} data-testid="statement-pay" variant="secondary" size="md">
                <Wallet className="h-4 w-4" />
                {PAY_ACTION_LABEL}
              </Button>
            )}
            <Button type="button" onClick={() => void exportExcel()} disabled={exporting} variant="secondary" size="md">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4 text-slate-500" />}
              Excel
            </Button>
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
            <Button type="button" onClick={() => void load()} variant="secondary" size="md" className="mt-1">Повторить</Button>
          )}
        </div>
      ) : statement && m ? (
        <>
          <StatementHeader statement={statement} studentLink={studentHref(bases.students, m.student_id, "payments")} groupLink={groupHref(bases.groups, m.group_id)} />

          {/* Month switcher */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2" data-testid="statement-months">
            <div className="flex items-center gap-1">
              <Button
                type="button"
                onClick={() => setMonth(month === null ? openingMonth : shiftMonthKey(month, -1))}
                disabled={month !== null && month <= months[0]}
                aria-label="Предыдущий месяц"
                variant="secondary" size="icon"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className={`min-w-[9rem] text-center text-sm ${month ? "font-semibold text-slate-900" : "text-slate-500"}`} aria-live="polite">{month ? statementMonthLabel(month) : "Выберите месяц"}</span>
              <Button
                type="button"
                onClick={() => setMonth(month === null ? openingMonth : shiftMonthKey(month, 1))}
                disabled={month !== null && month >= months[months.length - 1]}
                aria-label="Следующий месяц"
                variant="secondary" size="icon"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <button
              type="button"
              onClick={() => setMonth(month === null ? null : "all")}
              aria-pressed={month === null}
              className={`${BUTTON} ${month === null ? "border-primary-300 bg-primary-50 text-primary-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
            >
              Все месяцы
            </button>
            <label className="ml-auto flex items-center gap-2 py-1.5 text-sm text-slate-700 max-sm:min-h-10">
              <Checkbox checked={withVoided} onChange={(event) => setWithVoided(event.target.checked)} />
              Показать отменённые
            </label>
          </div>

          <StatementTimeline statement={statement} menuFor={rowMenu} extraFor={(entry) => (entry.type === "refund" || entry.type === "writeoff" ? (recordedOnMark(entry.raw.details.recorded_on, entry.date) ? <span data-testid="entered-later" className="mt-0.5 block text-xs font-medium text-amber-800">{recordedOnMark(entry.raw.details.recorded_on, entry.date)}</span> : null) : entry.type === "payment" ? <>{entered.get(entry.raw.details.payment_id ?? "") && <span data-testid="entered-later" className="mt-0.5 block text-xs font-medium text-amber-800">{entered.get(entry.raw.details.payment_id ?? "")}</span>}{cheques.filesOf(entry.raw.details.payment_id)}</> : null)} withVoided={withVoided} month={month}
            restorable={restorable}
            onRestore={(payment) => setVoidRecord(paymentRestoreTarget(payment, m?.student_name, () => { showToast("Оплата восстановлена", "success"); changed(); void cheques.reload(); }, () => { changed(); }))} />
        </>
      ) : null}

      <PaymentDialog
        open={correct !== null}
        kind="replace"
        membership={correct && m ? { membership_id: m.membership_id, student_name: m.student_name, group_name: m.group_name } : null}
        payment={correct}
        onClose={() => setCorrect(null)}
        onSaved={(result) => { const note = studentToast(savedPaymentToastDetails("replace", result)); showToast("Оплата исправлена", note.tone, note.details); changed(); void cheques.reload(); }}
        onDuplicate={(notice) => { showToast(notice.text, notice.tone); changed(); }}
        onStale={() => { changed(); void cheques.reload(); }}
      />
      <PaymentVoidModal
        payment={voidPayment}
        studentName={m?.student_name}
        onClose={() => setVoidPayment(null)}
        onVoided={(result) => { const note = studentToast(serverEffectsRows(result)); showToast("Оплата отменена", note.tone, note.details); changed(); void cheques.reload(); }}
        onStale={() => { changed(); void cheques.reload(); }}
      />
      <RecordVoidModal target={voidRecord} onClose={() => setVoidRecord(null)} />
      <PaymentDialog
        open={payOpen}
        kind="create"
        membership={m ? { membership_id: m.membership_id, group_id: m.group_id, student_name: m.student_name, group_name: m.group_name } : null}
        payment={null}
        groupsBasePath={bases.groups}
        onClose={() => setPayOpen(false)}
        onSaved={(result) => { const note = studentToast(savedPaymentDetails(result.allocation)); showToast(PAYMENT_SAVED_TEXT.create, note.tone, note.details); changed(); void cheques.reload(); }}
        onDuplicate={(notice) => { showToast(notice.text, notice.tone); changed(); }}
      />
      {cheques.dialogs}
      {toastNode}
    </div>
  );
}

/** A «?» with what a figure is (a bubble, reachable without hover). */
function Help({ text, label }: { text: string; label: string }) {
  return (
    <Hint text={text} className="inline-flex text-slate-500">
      <HelpCircle className="h-3.5 w-3.5" aria-label={label} />
    </Hint>
  );
}

/** The title, who and which group, and the tiles: Стоимость обучения · Оплачено · Остаток (+ Прощено / Возвращено when there are some). */
export function StatementHeader({ statement, studentLink, groupLink }: {
  statement: StatementOut;
  /** The card of the student on its «Оплаты» tab and the page of the group: the statement is no dead end (IA audit F28). */
  studentLink?: string;
  groupLink?: string;
}) {
  const m = statement.membership;
  const totals = statementTotals(statement.summary);
  const states = statementStates(statement.summary);
  const reconciles = statementReconciles(statement);
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
        {!m.is_active && <p className="text-xs text-slate-500">Ученик больше не в этой группе</p>}
      </header>

      <section aria-label="Итоги" data-testid="statement-summary" data-reconciles={reconciles ? "true" : "false"} className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between lg:gap-x-10">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-10">
            {totals.map((total) => (
              <div key={total.key}>
                <dt className="flex items-center gap-1 text-xs text-slate-500">
                  {total.label}
                  {total.hint && <Help text={total.hint} label={`Что значит «${total.label}»`} />}
                </dt>
                <dd className="text-sm font-semibold tabular-nums text-slate-900">{total.text}</dd>
              </div>
            ))}
          </dl>
          {/* the state: ONE big word of the server (or TWO side by side, the debt first) with its quiet line under it; a phone puts it on its own row under a rule (frame 21) */}
          {states.length > 0 && (
            <div data-testid="statement-state" className="flex flex-wrap items-start gap-x-8 gap-y-2 border-t border-slate-100 pt-3 lg:justify-end lg:border-0 lg:pt-0 lg:text-right">
              {states.map((state) => (
                <div key={state.key} data-testid={`statement-state-${state.key}`}>
                  <p className={`text-lg font-bold tabular-nums ${STATE_TONE[state.tone]}`}>{state.text}</p>
                  {state.sub && <p className={`text-xs ${STATE_SUB_TONE[state.tone]}`}>{state.sub}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
        {/* «всё сходится» is not said (nothing to decide); only a mismatch is - red, with its «?» */}
        {!reconciles && (
          <p className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-2.5 text-xs font-medium text-rose-700" data-testid="statement-reconciles">
            <AlertCircle className="h-3.5 w-3.5" aria-hidden />
            <span className="font-semibold">{`Не сходится: расхождение ${formatMoney(Math.abs(statementDiff(statement.summary)))}`}</span>
            <Help text={STATEMENT_HINTS.reconciles} label="Как проверяется «Всё сходится»" />
          </p>
        )}
      </section>
    </>
  );
}

/** The bank statement: a light row per month, then the rows of the month; the periods to come and the cancelled records below. */
export function StatementTimeline({
  statement, menuFor, extraFor, withVoided, month = null, restorable, onRestore,
}: {
  statement: StatementOut;
  menuFor: (entry: StatementEntry) => RowMenuItem[];
  /** Under the operation of a row: the cheques attached to a payment. */
  extraFor?: (entry: StatementEntry) => ReactNode;
  withVoided: boolean;
  month?: string | null;
  /** Money-2 T7: the ids of the cancelled payments that can be restored, and what «Восстановить оплату» does. */
  restorable?: ReadonlySet<string>;
  onRestore?: (payment: VoidablePayment) => void;
}) {
  const items = buildStatementItems(statement, month);
  const cancelled = statement.voided.map(statementRowView);
  const hasRows = statement.rows.length > 0;
  return (
    <>
      {!hasRows ? (
        <EmptyState icon={ScrollText} title="В выписке пока нет записей" hint="Стоимость появится, когда начнётся первый период, оплаты — после первой оплаты." />
      ) : (
        <DataTable columns={STATEMENT_COLUMNS} minWidth={760} gap="0.75rem" align="start" ariaLabel="Записи счёта" testId="statement-table">
          {items.map((item, index) => <StatementItemRow key={`${item.kind}-${index}-${"seq" in item ? item.seq : ""}`} item={item} menuFor={menuFor} extraFor={extraFor} />)}
        </DataTable>
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
            <p className="mt-1 text-xs text-slate-500">Отменённых записей нет</p>
          ) : (
            <ul className="mt-1 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white px-3.5">
              {cancelled.map((view, index) => (
                <li key={`${view.seq}-${view.type}-x`} className="py-2 text-xs text-slate-500">
                  <p>
                    <span className="tabular-nums">{formatDateRu(view.date)}</span>
                    <span className="mx-1.5 text-slate-300">·</span>
                    <span className="line-through">{view.title}</span>
                    <span className="ml-2 tabular-nums">{view.effect.replace(/^[+\u2212]/, "")}</span>
                  </p>
                  {(view.type === "refund" || view.type === "writeoff") && recordedOnMark(statement.voided[index].details.recorded_on, view.date) && <p className="font-medium text-amber-800" data-testid="entered-later">{recordedOnMark(statement.voided[index].details.recorded_on, view.date)}</p>}
                  {view.cancelNote && <p className="text-slate-500">{view.cancelNote}</p>}
                  {view.type === "payment" && view.paymentId && restorable?.has(view.paymentId) && onRestore && (
                    <Button type="button" variant="secondary" size="sm" className="mt-1.5" data-testid="statement-restore" onClick={() => onRestore({ id: view.paymentId as string, paid_on: view.date, amount: statement.voided[index].credit })}>Восстановить оплату</Button>
                  )}
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

/** The tone of a part of «Остаток» by the server's name: the debt red, «К оплате» the calm blue, the advance green; «Оплачено» is a quiet word, not a chip. */
const OPEN_TONE = { debt: PAY_STATE_TONE.debt, due: PAY_STATE_TONE.to_pay, advance: "ok" } as const;

/** «Остаток» of a row: what is open on the row ITSELF today - one chip, TWO (the debt first) or a quiet «Оплачено»; empty when the server named nothing (a refund, a write-off, a transfer out). */
export function OpenCell({ parts }: { parts: OpenPart[] }) {
  if (parts.length === 0) return null;
  return (
    <span className="inline-flex flex-col items-center gap-1" data-testid="statement-open">
      {parts.map((part) => (part.name === "paid" || part.name === "forgiven"
        ? <span key={part.name} data-testid="statement-open-paid" className="text-sm text-slate-500">{part.text}</span>
        : <StatusChip key={part.name} tone={OPEN_TONE[part.name]} testId="statement-open-chip" className="tabular-nums">{part.text}</StatusChip>))}
    </span>
  );
}

function StatementItemRow({ item, menuFor, extraFor }: { item: StatementItem; menuFor: (entry: StatementEntry) => RowMenuItem[]; extraFor?: (entry: StatementEntry) => ReactNode }) {
  if (item.kind === "month") {
    return (
      <>
        <DataSpanRow testId="statement-month"><span className="font-semibold text-slate-800">{item.title}</span></DataSpanRow>
        {item.empty && <DataSpanRow tone="note" testId="statement-month-empty"><span>В этом месяце записей нет</span></DataSpanRow>}
      </>
    );
  }
  return <StatementRowItem entry={item} menu={menuFor(item)} extra={extraFor?.(item) ?? null} />;
}

function StatementRowItem({ entry, menu, extra }: { entry: StatementEntry; menu: RowMenuItem[]; extra: ReactNode }) {
  const paidText = statementPaidText(entry);
  const chargedText = statementChargedText(entry);
  return (
    <DataRow testId={`statement-row-${entry.type}`}>
      <DataCell col="date"><span className="text-sm tabular-nums text-slate-700">{formatDateRu(entry.date)}</span></DataCell>
      <DataCell col="operation">
        <div className="flex min-w-0 gap-2.5">
          <StatementRowIcon entry={entry} />
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-medium leading-6 text-slate-900">
              {entry.title}
              {entry.tag && <span data-testid="statement-row-tag" className="ml-1.5 inline-block rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px align-middle text-xs font-semibold text-slate-600">{entry.tag}</span>}
            </p>
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
      </DataCell>
      <DataCell col="charged" testId="statement-cell-charged" className={chargedText ? undefined : "dt-card-hidden"}><span className={STATEMENT_AMOUNT_CLASS}>{chargedText}</span></DataCell>
      <DataCell col="paid" testId="statement-cell-paid" className={paidText ? undefined : "dt-card-hidden"}>
        <span className={STATEMENT_PAID_CLASS}>{paidText}</span>
      </DataCell>
      <DataCell col="balance" testId="statement-cell-balance"><OpenCell parts={entry.open} /></DataCell>
      <DataCell col="menu">
        {menu.length > 0 ? <RowMenu items={menu} label={`Действия с записью: ${entry.title}`} tooltip="Действия с записью" width={220} /> : null}
      </DataCell>
    </DataRow>
  );
}
