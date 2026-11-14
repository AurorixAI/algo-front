// Money-1 / Г front: the windows of the pack «Г» in a real DOM - the REAL components and hooks, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";
import { CancelMissedLessonModal } from "@/components/attendance/cancel-missed-lesson-modal";
import { DecisionDialog } from "@/components/substitutions/decision-dialog";
import { BulkDialog } from "@/components/substitutions/bulk-dialog";
import { PaymentVoidModal } from "@/components/payments/payment-void-modal";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { IncomeDecisions } from "@/components/payments/income-decisions";
import { MethodsDonut } from "@/components/payments/income-parts";
import { JournalList } from "@/components/payments/income-journal";
import { normalizeJournal, normalizeOverview } from "@/lib/payments-income-v2";
import { AttendanceConflictBody, AttendanceConflictDialog } from "@/components/attendance/attendance-ops-dialogs";
import { StudentDiagnosticDialog } from "@/components/students/student-diagnostic-dialog";
import NewStudentPage from "@/app/admin/students/new/page";
import AdminDiagnosticsPage from "@/app/admin/diagnostics/page";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

const ITEM = (id: string, date: string, minutesToStart = 3000, reasonCode = "sick") => ({
  id, status: "pending", group: { id: "g1", name: "Алгебра 7 (вт/пт)" },
  lesson: { lessonId: `l-${id}`, date, startTime: "16:00", endTime: "17:00", format: "offline" },
  teacher: { id: "t1", name: "Каримова Дилдора Рустамовна" }, reasonCode, minutesToStart, urgent: false, overdue: false,
});

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "cancelMissed":
      root.render(<CancelMissedLessonModal target={{ groupId: "g1", lessonId: "l1", lessonDate: "2026-11-03" }} onClose={() => log("close")} onCancelled={(target, notes) => log(`cancelled:${target.lessonDate}:${notes.join("|")}`)} />);
      break;
    case "sheetCancel":
      root.render(<LessonActionSheet
        lesson={{ id: "l1", date: "2099-11-20", startTime: "16:00", endTime: "17:00", status: "scheduled" } as never}
        groupId="g1" title="Алгебра 7 (вт/пт)" subtitle="пт, 20 ноября · 16:00–17:00" teacherLine={null} actions={(props.actions ?? ["assign", "reschedule", "cancel"]) as never} assignLabel="Назначить замену"
        onClose={() => log("close")} onChanged={(text: string) => log(`changed:${text}`)} />);
      break;
    case "decision":
      root.render(<DecisionDialog item={ITEM("r1", props.past ? "2026-11-10" : "2099-11-20", props.past ? -5800 : 3000, props.reasonCode) as never} role={props.role ?? "admin"} onClose={() => log("close")} onDecided={() => log("decided")} onStale={() => log("stale")} />);
      break;
    case "bulk":
      root.render(<BulkDialog kind="cancel" items={(props.dates as string[]).map((date, index) => ITEM(`r${index + 1}`, date)) as never} role="admin" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "voidPayment":
      root.render(<PaymentVoidModal payment={{ id: "p1", paid_on: "2026-11-05", amount: 300000 }} studentName="Каримов Фарходжон Рустамович" onClose={() => log("close")} onVoided={() => log("voided")} />);
      break;
    case "replace":
      root.render(<PaymentDialog open kind="replace" membership={{ membership_id: "m1", group_id: "g1", student_name: "Каримов Фарходжон Рустамович", group_name: "Алгебра 7 (вт/пт)" }} payment={props.payment ?? { id: "p1", amount: 400000, paid_on: "2026-11-05", method: "cash", note: null }} onClose={() => log("close")} onSaved={() => log("saved")} onDuplicate={() => log("duplicate")} />);
      break;
    case "decisions":
      root.render(<IncomeDecisions period={{ kind: "month", from: "2026-11-01", to: "2026-11-30" } as never} authors={[]} paymentsBase="/owner/payments" studentProfileBasePath="/owner/students" />);
      break;
    case "donut":
      root.render(<div className="mx-auto" style={{ width: props.width ?? 420 }}><MethodsDonut overview={props.overview} cashToday={normalizeOverview({ cash: props.cash } as never).cash} /></div>);
      break;
    case "journal":
      root.render(<div className="mx-auto" style={{ width: props.width ?? 1000 }}><JournalList rows={normalizeJournal({ rows: props.rows } as never).rows} withYear={false} activeId={null} onOpen={() => log("open")} /></div>);
      break;
    case "conflict":
      root.render(<div className="mx-auto" style={{ width: props.width ?? 420 }}><AttendanceConflictBody conflict={props.conflict} names={props.names} /></div>);
      break;
    case "conflictDialog":
      root.render(<AttendanceConflictDialog conflict={props.conflict} names={props.names} busy={false} onKeepMine={() => log("mine")} onTakeTheirs={() => log("theirs")} />);
      break;
    case "diagDialog":
      root.render(<StudentDiagnosticDialog open studentId="s1" studentName="Каримов Фарходжон Рустамович" classLevel={7} initialKind="initial" onClose={() => log("close")} onCreated={() => log("created")} />);
      break;
    case "newStudent":
      root.render(<NewStudentPage />);
      break;
    case "diagList":
      root.render(<div className="mx-auto max-w-5xl p-4"><AdminDiagnosticsPage /></div>);
      break;
    default:
      break;
  }
};
