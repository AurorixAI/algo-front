"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Loader2, Wallet } from "lucide-react";
import { DEMO_MODE, orgApi, type StudentProfile } from "@/lib/api";
import { type MembershipPaymentRow } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { MembershipPayments } from "@/components/payments/membership-payments";
import { useToast } from "@/components/ui/toast";
import { studentArchiveAccess } from "@/lib/student-archive";

interface StudentPaymentsBlockProps {
  profile: StudentProfile;
  /** `/owner/payments` or `/admin/payments`: where the receipt pages of this workspace live. */
  paymentsBasePath: string;
  /** `/owner/groups` or `/admin/groups`: where the price of a group is set. */
  groupsBasePath: string;
  /** A teacher never sees (and never requests) money. */
  isTeacher: boolean;
  /** Changes when the student joins or leaves a group, so the money is read again. */
  refreshKey: string;
}

/**
 * «Оплаты» tab of the student card: for each group of the student the price (of the group, or an individual
 * one), the status, the history, the actions, the receipts and the cheques.  Rendered only for a role that
 * may see money and only while the server says so; nothing is requested otherwise.
 */
export function StudentPaymentsBlock({ profile, paymentsBasePath, groupsBasePath, isTeacher, refreshKey }: StudentPaymentsBlockProps) {
  const studentId = profile.student.id;
  const studentName = profile.student.full_name;

  const available = usePaymentsSummary((state) => state.available);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const lessonsDefault = usePaymentsSummary((state) => state.lessonsPerPayment);
  const moneyEnabled = !isTeacher && !DEMO_MODE && available;
  // An archived student keeps his payment history, read-only: no «Внести / Продлить», no individual price, no «Исправить»
  // (the server refuses them); «Отменить» stays so that a mistaken payment can be cancelled.
  const access = studentArchiveAccess({ isTeacher, status: profile.student.status });
  const archived = access.showBanner;
  const readOnly = !access.paymentActions;

  const [rows, setRows] = useState<MembershipPaymentRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requests = useRef(createRequestSequence());
  const { showToast, toastNode } = useToast();

  const load = useCallback(() => {
    const token = requests.current.next();
    setError(null);
    orgApi.getStudentMemberships(studentId)
      .then((list) => { if (requests.current.isCurrent(token)) setRows(Array.isArray(list) ? list : []); })
      .catch((cause) => {
        if (requests.current.isCurrent(token)) setError(cause instanceof Error ? cause.message : "Не удалось загрузить оплаты");
      });
  }, [studentId]);

  // Money is requested only for a role that may see it.
  useEffect(() => {
    if (!moneyEnabled) { setRows(null); return; }
    load();
    return () => { requests.current.next(); };
  }, [moneyEnabled, load, refreshKey]);

  const replaceRow = (next: MembershipPaymentRow) =>
    setRows((previous) => previous?.map((row) => (row.membership_id === next.membership_id ? next : row)) ?? previous);

  if (!moneyEnabled) return null;

  const active = [...(rows ?? [])].filter((row) => row.is_active && !readOnly).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  // Closed memberships keep their payment history (all of them, for an archived student).
  const former = (rows ?? []).filter((row) => !row.is_active || readOnly);

  const card = (row: MembershipPaymentRow, muted: boolean) => (
    <li key={row.membership_id} className={`rounded-2xl border p-5 ${muted ? "border-slate-100 bg-slate-50/60" : "border-slate-100 bg-slate-50"}`}>
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`break-words font-bold ${muted ? "text-sm text-slate-700" : "text-base text-slate-900"}`}>{row.group_name}</span>
          {!muted && row.class_level ? (
            <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{row.class_level} класс</span>
          ) : null}
          {!muted && row.is_primary && active.length > 1 && (
            <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">основная</span>
          )}
        </div>
        {!muted && (
          <p className="text-sm text-slate-500">
            Преподаватель: <span className="font-medium text-slate-800">{row.teacher_name || "Не назначен"}</span>
          </p>
        )}
      </div>
      <MembershipPayments
        row={row}
        studentName={studentName}
        periodMode={periodMode}
        lessonsDefault={lessonsDefault}
        paymentsBasePath={paymentsBasePath}
        groupsBasePath={groupsBasePath}
        archived={archived}
        onRowChange={replaceRow}
        onNotify={showToast}
      />
    </li>
  );

  return (
    <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <h2 className="text-base font-semibold text-slate-800">Оплаты по группам</h2>
      {archived && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Ученик в архиве: история оплат и квитанций сохранена. Вносить, продлевать и исправлять оплату нельзя — только отменить ошибочную.
        </p>
      )}

      {error ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
          <AlertCircle className="h-6 w-6 text-rose-500" />
          <p className="text-sm font-medium text-rose-800">{error}</p>
          <button type="button" onClick={load} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Повторить</button>
        </div>
      ) : rows === null ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-primary-600" />
          Загружаем оплаты…
        </div>
      ) : active.length === 0 && former.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 py-8 text-center">
          <Wallet className="h-6 w-6 text-slate-300" />
          <p className="text-sm font-medium text-slate-700">{archived ? "Оплат по прежним группам нет" : "Ученик не состоит в группах"}</p>
          <p className="text-xs text-slate-400">{archived ? "Оплаты появятся, если вернуть ученика в группу." : "Оплаты появятся после зачисления в группу."}</p>
        </div>
      ) : (
        <>
          {active.length > 0 && <ul className="space-y-3">{active.map((row) => card(row, false))}</ul>}
          {former.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-400">Прежние группы</p>
              <ul className="space-y-3">{former.map((row) => card(row, true))}</ul>
            </div>
          )}
        </>
      )}

      {toastNode}
    </div>
  );
}
