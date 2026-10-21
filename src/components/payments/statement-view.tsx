"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Check, FileSpreadsheet, Loader2, Pencil, Printer, Receipt, ScrollText, Wallet, X, XCircle } from "lucide-react";
import { orgApi } from "@/lib/api";
import { saveBlobAs } from "@/lib/download";
import {
  formatDateRu,
  formatMoney,
  receiptHref,
  type StatementOut,
} from "@/lib/payments";
import {
  statementDiff,
  statementFileName,
  statementReconciles,
  statementRowView,
  statementTotals,
  upcomingLine,
  validateStatementRange,
  BALANCE_TEXT_CLASS,
  type StatementRowView,
} from "@/lib/payments-ledger";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { canGoBack, clearReceiptNavigationMark, markReceiptNavigation, receiptNavigationMarked } from "@/lib/receipt-nav";
import { createRequestSequence } from "@/lib/request-sequence";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { useToast } from "@/components/ui/toast";
import { PaymentDialog, type EditablePayment } from "./payment-dialog";
import { PaymentVoidModal, type VoidablePayment } from "./payment-void-modal";
import { RecordVoidModal, type VoidTarget } from "./record-void-modal";

/** Date · operation · movement · balance · actions; the table of a ledger, right-aligned over the digits. */
const GRID = "md:grid md:grid-cols-[88px_minmax(0,1fr)_120px_150px_40px] md:items-start md:gap-x-4";

const FILTER_FIELD = "rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10";

const TOTAL_TONE = {
  debt: "text-rose-700",
  advance: "text-emerald-700",
  none: "text-slate-900",
  plain: "text-slate-900",
} as const;

const EFFECT_TONE = { plus: "text-emerald-700", minus: "text-slate-800", zero: "text-slate-500" } as const;

/**
 * «Выписка»: the account of one student in one group as a single timeline - charges (period, price, where the price
 * comes from), payments (method, who) with where each payment went, write-offs (reason, who), refunds, transfers - and
 * the running balance after every row (minus = debt, plus = advance).  The header adds up the whole account and says
 * whether it «сходится».  Print and Excel (built by the server).  Shared by /owner/payments/statement/[id] and /admin/….
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
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [withVoided, setWithVoided] = useState(false);
  const [exporting, setExporting] = useState(false);
  const requests = useRef(createRequestSequence());

  const [correct, setCorrect] = useState<EditablePayment | null>(null);
  const [voidPayment, setVoidPayment] = useState<VoidablePayment | null>(null);
  const [voidRecord, setVoidRecord] = useState<VoidTarget | null>(null);

  const rangeProblem = validateStatementRange(from, to);

  const load = useCallback(async (silent = false) => {
    const token = requests.current.next();
    if (!silent) setLoading(true);
    setFailure(null);
    try {
      const data = await orgApi.getStatement(membershipId, { from: from || undefined, to: to || undefined, include_voided: withVoided });
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
  }, [membershipId, from, to, withVoided]);

  useEffect(() => {
    if (!membershipId || noRight || rangeProblem) { if (rangeProblem) setLoading(false); return; }
    void load();
    return () => { requests.current.next(); };
  }, [membershipId, noRight, rangeProblem, load]);

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
      const file = await orgApi.exportStatement(membershipId, { from: from || undefined, to: to || undefined, include_voided: withVoided }, statementFileName(statement));
      saveBlobAs(file.blob, file.filename);
    } catch (cause) {
      showToast(cause instanceof Error ? cause.message : "Не удалось скачать Excel", "error");
    } finally {
      setExporting(false);
    }
  };


  const rowMenu = (row: StatementRowView, item: StatementOut["rows"][number]): RowMenuItem[] => {
    const items: RowMenuItem[] = [];
    if (row.type === "payment" && row.paymentId) {
      const id = row.paymentId;
      if (row.receiptNo) {
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
    if (row.type === "writeoff" && row.writeoffId) {
      const id = row.writeoffId;
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
    if (row.type === "refund" && row.refundId) {
      const id = row.refundId;
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

          {/* Period and cancelled records */}
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2 print:hidden">
            <div>
              <label htmlFor="statement-from" className="mb-0.5 block text-xs font-medium text-slate-500">С</label>
              <input id="statement-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} className={FILTER_FIELD} />
            </div>
            <div>
              <label htmlFor="statement-to" className="mb-0.5 block text-xs font-medium text-slate-500">По</label>
              <input id="statement-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} className={FILTER_FIELD} />
            </div>
            {(from || to) && (
              <button type="button" onClick={() => { setFrom(""); setTo(""); }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100">
                <X className="h-3.5 w-3.5" aria-hidden />
                Весь период
              </button>
            )}
            <label className="ml-auto flex items-center gap-2 py-1.5 text-sm text-slate-700">
              <input type="checkbox" checked={withVoided} onChange={(event) => setWithVoided(event.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-primary-600" />
              Показать отменённые
            </label>
          </div>
          {rangeProblem && <p role="alert" className="text-sm font-medium text-rose-700 print:hidden">{rangeProblem}</p>}
          {(from || to) && (
            <p className="text-xs text-slate-500">
              Показаны записи {from ? `с ${formatDateRu(from)}` : ""}{from && to ? " " : ""}{to ? `по ${formatDateRu(to)}` : ""}. Остаток считается с начала учёта, итоги сверху — по всему счёту.
            </p>
          )}

          <StatementTimeline statement={statement} menuFor={rowMenu} withVoided={withVoided} />
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

/** The title, who and which group, and the totals of the whole account with the line «Сходится». */
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
          По состоянию на {formatDateRu(statement.as_of)}, учёт ведётся с {formatDateRu(statement.accounting_start)}
          {!m.is_active && " · ученик больше не в этой группе"}
        </p>
      </header>

      {/* Totals of the whole account */}
      <section aria-label="Итоги" className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 print:rounded-none print:border-slate-400">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 lg:flex lg:flex-wrap lg:items-end lg:gap-x-8">
          {totals.map((total) => (
            <div key={total.key} className={total.key === "balance" ? "col-span-2 sm:col-span-1 lg:ml-auto" : ""}>
              <dt className="text-xs text-slate-500">{total.label}</dt>
              <dd className={`tabular-nums ${total.key === "balance" ? "text-lg font-bold" : "text-sm font-semibold"} ${TOTAL_TONE[total.tone]}`}>{total.text}</dd>
            </div>
          ))}
        </dl>
        <p className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-slate-100 pt-2.5 text-xs ${reconciles ? "text-slate-500" : "font-medium text-rose-700"}`} data-testid="statement-reconciles">
          {reconciles ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden /> : <AlertCircle className="h-3.5 w-3.5" aria-hidden />}
          <span className={reconciles ? "font-semibold text-emerald-700" : ""}>{reconciles ? "Сходится" : `Не сходится: расхождение ${formatMoney(Math.abs(statementDiff(statement.summary)))}`}</span>
          <span>начислено − оплачено − списано + возвращено = долг − аванс</span>
        </p>
      </section>
    </>
  );
}

/** The timeline: one row per charge / payment / write-off / refund / transfer with the running balance, the periods to come, the cancelled records. */
export function StatementTimeline({
  statement, menuFor, withVoided,
}: {
  statement: StatementOut;
  menuFor: (view: StatementRowView, row: StatementOut["rows"][number]) => RowMenuItem[];
  withVoided: boolean;
}) {
  const rows = statement.rows.map(statementRowView);
  const cancelled = statement.voided.map(statementRowView);
  return (
    <>
      {/* The timeline */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-2xl border border-dashed border-slate-200 bg-white/60 px-4 py-12 text-center">
          <ScrollText className="h-6 w-6 text-slate-300" aria-hidden />
          <p className="text-sm font-medium text-slate-700">В выписке пока нет записей</p>
          <p className="max-w-sm text-xs text-slate-500">Начисления появятся, когда начнётся первый период, оплаты — после первой оплаты.</p>
        </div>
      ) : (
        <section aria-label="Записи счёта" className="md:overflow-hidden md:rounded-2xl md:border md:border-slate-200 md:bg-white print:border-slate-400">
          <div role="presentation" className={`hidden border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-[13px] font-semibold text-slate-500 ${GRID} md:items-center`}>
            <span className="text-center">Дата</span>
            <span>Операция</span>
            <span className="text-right">Сумма</span>
            <span className="text-right">Долг / аванс после</span>
            <span className="sr-only">Действия</span>
          </div>
          <ol className="space-y-2.5 md:space-y-0 md:divide-y md:divide-slate-100">
            {rows.map((view, index) => (
              <StatementRowItem key={`${view.seq}-${view.type}`} view={view} menu={menuFor(view, statement.rows[index])} />
            ))}
          </ol>
        </section>
      )}

      {statement.upcoming.length > 0 && (
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

function StatementRowItem({ view, menu }: { view: StatementRowView; menu: RowMenuItem[] }) {
  return (
    <li
      className={`rounded-xl border border-slate-200 bg-white p-3.5 md:rounded-none md:border-0 md:bg-transparent md:px-4 md:py-3 print:break-inside-avoid ${GRID}`}
      data-testid={`statement-row-${view.type}`}
    >
      <p className="text-xs tabular-nums text-slate-500 md:text-center md:text-sm md:text-slate-700">{formatDateRu(view.date)}</p>

      <div className="mt-1 min-w-0 md:mt-0">
        <p className="text-sm text-slate-900">
          <span className="font-medium">{view.title}</span>
        </p>
        {view.notes.length > 0 && <p className="break-words text-xs text-slate-500">{view.notes.join(" · ")}</p>}
        {view.allocations.length > 0 && (
          <ul aria-label="Куда пошли деньги" className="mt-1 space-y-px border-l-2 border-slate-100 pl-2.5 text-xs text-slate-600">
            {view.allocations.map((line, index) => (
              <li key={`${line.label}-${index}`} className="flex items-baseline justify-between gap-3">
                <span className="min-w-0">{line.label}</span>
                <span className="shrink-0 tabular-nums text-slate-500">{formatMoney(line.amount)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 flex items-baseline justify-between gap-3 md:mt-0 md:block md:text-right">
        <span className="text-xs text-slate-400 md:hidden">Сумма</span>
        <span className={`text-sm font-semibold tabular-nums ${EFFECT_TONE[view.effectSign]}`}>{view.effect}</span>
      </div>

      <div className="flex items-baseline justify-between gap-3 md:block md:text-right">
        <span className="text-xs text-slate-400 md:hidden">Долг / аванс после</span>
        <span className={`text-sm tabular-nums ${BALANCE_TEXT_CLASS[view.balanceKind]}`}>{view.balance}</span>
      </div>

      <div className="mt-1 flex justify-end md:mt-0 print:hidden">
        {menu.length > 0 ? <RowMenu items={menu} label={`Действия: ${view.title}`} width={220} /> : <span className="h-8 w-8" aria-hidden />}
      </div>
    </li>
  );
}
