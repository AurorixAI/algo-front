"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ExternalLink, Plus, Users } from "lucide-react";
import { DEMO_MODE, orgApi, type StudentGroupMembership, type StudentProfile } from "@/lib/api";
import { formatDateRu, type MembershipPaymentRow } from "@/lib/payments";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { createRequestSequence } from "@/lib/request-sequence";
import { MembershipPayments } from "@/components/payments/membership-payments";
import { useToast } from "@/components/ui/toast";

/** Active memberships of the profile; an older server sends only the single `group`. */
export function profileMemberships(profile: Pick<StudentProfile, "groups" | "group" | "student">): StudentGroupMembership[] {
  if (profile.groups && profile.groups.length > 0) return profile.groups;
  if (!profile.group) return [];
  return [{
    membership_id: "",
    group_id: profile.group.id,
    group_name: profile.group.name,
    teacher_id: profile.group.teacher_id,
    teacher_name: profile.group.teacher_name,
    class_level: profile.group.class_level,
    is_primary: true,
    joined_at: null,
  }];
}

interface StudentGroupsBlockProps {
  profile: StudentProfile;
  groupsBasePath: string;
  /** A teacher never sees (and never requests) money. */
  isTeacher: boolean;
  onAssign: (mode: "transfer" | "add") => void;
}

/**
 * «Группы» of the student card: every active membership with the main one marked,
 * the teacher and the join date.  Owners (and administrators the owner allowed) also
 * get the money of each membership.
 */
export function StudentGroupsBlock({ profile, groupsBasePath, isTeacher, onAssign }: StudentGroupsBlockProps) {
  const memberships = profileMemberships(profile);
  const studentId = profile.student.id;
  const studentName = profile.student.full_name;

  const available = usePaymentsSummary((state) => state.available);
  const periodMode = usePaymentsSummary((state) => state.periodMode);
  const lessonsDefault = usePaymentsSummary((state) => state.lessonsPerPayment);
  const moneyEnabled = !isTeacher && !DEMO_MODE && available;

  const [rows, setRows] = useState<MembershipPaymentRow[] | null>(null);
  const requests = useRef(createRequestSequence());
  const { showToast, toastNode } = useToast();

  // Money is requested only for a role that may see it; a failure just leaves it out.
  useEffect(() => {
    if (!moneyEnabled) { setRows(null); return; }
    const token = requests.current.next();
    orgApi.getStudentMemberships(studentId)
      .then((list) => { if (requests.current.isCurrent(token)) setRows(Array.isArray(list) ? list : []); })
      .catch(() => { if (requests.current.isCurrent(token)) setRows(null); });
    return () => { requests.current.next(); };
  }, [moneyEnabled, studentId, profile.groups?.length]);

  const rowOf = (membershipId: string) => rows?.find((row) => row.membership_id === membershipId) ?? null;
  const replaceRow = (next: MembershipPaymentRow) =>
    setRows((previous) => previous?.map((row) => (row.membership_id === next.membership_id ? next : row)) ?? previous);

  const activeIds = new Set(memberships.map((item) => item.membership_id));
  // Closed memberships keep their payment history.
  const former = (rows ?? []).filter((row) => !row.is_active && !activeIds.has(row.membership_id));

  const sorted = [...memberships].sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  return (
    <div className="space-y-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-slate-800">Группы</h2>
        {!isTeacher && memberships.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onAssign("add")}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <Plus className="h-3.5 w-3.5" />
              Добавить в группу
            </button>
            <button
              type="button"
              onClick={() => onAssign("transfer")}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Перевести
            </button>
          </div>
        )}
      </div>

      {memberships.length === 0 ? (
        <div className="space-y-3 rounded-2xl border border-amber-200/60 bg-amber-50/60 p-6 text-center">
          <p className="text-sm font-medium text-amber-900">Ученик ещё не зачислен ни в одну группу</p>
          {!isTeacher && (
            <button
              type="button"
              onClick={() => onAssign("transfer")}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-primary-700"
            >
              <Users className="h-4 w-4" /> Зачислить в группу
            </button>
          )}
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((item) => {
            const row = moneyEnabled ? rowOf(item.membership_id) : null;
            return (
              <li key={item.membership_id || item.group_id} className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
                <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="break-words text-base font-bold text-slate-900">{item.group_name}</span>
                      {item.class_level ? (
                        <span className="rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs font-medium text-slate-600">{item.class_level} класс</span>
                      ) : null}
                      {item.is_primary && memberships.length > 1 && (
                        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">основная</span>
                      )}
                    </div>
                    <p className="text-sm text-slate-500">
                      Преподаватель: <span className="font-medium text-slate-800">{item.teacher_name || "Не назначен"}</span>
                      {item.joined_at && <span className="text-slate-400"> · с {formatDateRu(item.joined_at)}</span>}
                    </p>
                  </div>
                  <Link
                    href={`${groupsBasePath}/${item.group_id}`}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Перейти в группу
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
                {row && (
                  <MembershipPayments
                    row={row}
                    studentName={studentName}
                    periodMode={periodMode}
                    lessonsDefault={lessonsDefault}
                    onRowChange={replaceRow}
                    onNotify={showToast}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {former.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-400">Прежние группы</p>
          <ul className="space-y-3">
            {former.map((row) => (
              <li key={row.membership_id} className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
                <p className="text-sm font-semibold text-slate-700">{row.group_name}</p>
                <MembershipPayments
                  row={row}
                  studentName={studentName}
                  periodMode={periodMode}
                  lessonsDefault={lessonsDefault}
                  onRowChange={replaceRow}
                  onNotify={showToast}
                />
              </li>
            ))}
          </ul>
        </div>
      )}

      {toastNode}
    </div>
  );
}
