// R3 m5: the windows of money in a real DOM - the REAL components and hooks, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { PaymentVoidModal } from "@/components/payments/payment-void-modal";
import { RecordVoidModal } from "@/components/payments/record-void-modal";
import { WriteoffDialog } from "@/components/payments/writeoff-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { LessonReturnDialog, ReturnToReviewDialog } from "@/components/groups/lesson-return-dialogs";
import { ReopenMonthDialog } from "@/components/payroll/reopen-month-dialog";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";
import { OpenLessonsView } from "@/components/attendance/open-lessons-view";
import { useClosedMonthDialog } from "@/components/money/closed-month-dialog";
import { DecidedOneOffsBlock } from "@/components/substitutions/decided-one-offs";
import { OneOffDecisionsBlock } from "@/components/substitutions/one-off-decisions";
import { PayrollSheetPage } from "@/components/payroll/payroll-sheet-page";
import { GroupAttendanceJournal } from "@/components/groups/group-attendance-journal";
import { useToast } from "@/components/ui/toast";
import { MONTH_COLUMNS, PayrollMonthPage, TeacherRow } from "@/components/payroll/payroll-month-page";
import { TableHeader } from "@/components/attendance/table-chrome";
import { PayrollMonthSummary } from "@/components/payroll/month-status";
import { monthPeriodView, periodView } from "@/lib/closed-period";
import { monthTotals } from "@/lib/payroll";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { PayoutDialog } from "@/components/payroll/payout-dialog";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

const MEMBERSHIP = { membership_id: "m1", group_id: "g1", student_name: "Иванов Иван", group_name: "7-А Алгебра" };
const ROW = { membership_id: "m1", student_id: "st1", student_name: "Иванов Иван", group_id: "g1", group_name: "7-А Алгебра", is_primary: true, is_active: true, status: "ok", debt: 350000, refundable: 344000 };

/** The queue of the decisions with the REAL toast of the page: what a person sees after «Оплатить». */
function DecisionsWithToast({ items }: { items: any[] }) {
  const { showToast, toastNode } = useToast();
  return (
    <>
      <OneOffDecisionsBlock items={items} loading={false} error={null} canDecide rightLost={false} onRightLost={() => log("right-lost")} onRetry={() => log("retry")} onDecided={(id: string) => log(`decided:${id}`)} showToast={showToast} />
      {toastNode}
    </>
  );
}

function ClosedMonthProbe() {
  const closed = useClosedMonthDialog();
  return (
    <>
      <button id="ask" onClick={() => closed.show({ month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", closedOn: "2026-11-03", message: "Месяц октябрь 2026 у преподавателя Каримова К. закрыт: ведомость сохранена 03.11.2026. Чтобы исправить, владелец переоткрывает месяц." }, () => log("retry"))}>ask</button>
      {closed.node}
    </>
  );
}

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  const noop = () => {};
  switch (name) {
    case "till":
      root.render(<PaymentDialog open kind="create" membership={props.membership ?? MEMBERSHIP} onClose={() => log("close")} onSaved={() => log("saved")} onDuplicate={() => log("duplicate")} />);
      break;
    case "voidPayment":
      root.render(<PaymentVoidModal payment={{ id: "p1", paid_on: "2026-11-05", amount: 300000 }} studentName="Иванов Иван" onClose={() => log("close")} onVoided={() => log("voided")} />);
      break;
    case "recordVoid":
      root.render(<RecordVoidModal onClose={() => log("close")} target={{
        key: "w1", title: "Отменить прощение долга?", description: "05.11 · 40 000 сум", action: "Отменить прощение",
        run: async (reason) => { await orgApi.voidWriteoff("w1", reason); log("voided"); },
      }} />);
      break;
    case "writeoff":
      root.render(<WriteoffDialog row={ROW as never} studentName="Иванов Иван" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "refund":
      root.render(<RefundDialog row={ROW as never} studentName="Иванов Иван" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "review":
      root.render(<ReturnToReviewDialog target={{ groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28" }} onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "return":
      root.render(<LessonReturnDialog target={{ groupId: "g1", lessonId: "l1", lessonDate: "2026-10-28" }} onClose={() => log("close")} onDone={() => log("done")} onStale={() => log("stale")} />);
      break;
    case "reopen":
      root.render(<ReopenMonthDialog target={{ month: "2026-10", teacherId: "t1", teacherName: "Каримова К.", ...(props.sheetRevision !== undefined ? { sheetRevision: props.sheetRevision } : {}) }} onClose={() => log("close")} onReopened={() => log("reopened")} />);
      break;
    case "sheet":
      root.render(<LessonActionSheet
        lesson={{ id: "l1", date: "2026-11-20", startTime: "16:00", endTime: "17:00", status: "cancelled" } as never}
        groupId="g1" title="7-А Алгебра" subtitle="пт, 20 ноября · 16:00–17:00" teacherLine={null} actions={(props.actions ?? ["restore"]) as never}
        cancellationKind="centre" onClose={() => log("close")} onChanged={(text: string, notes?: string[]) => log(`changed:${text}:${(notes ?? []).join("|")}`)} onRefresh={() => log("refresh")} onReload={() => log("reload")} />);
      break;
    case "payout":
      root.render(<PayoutDialog open sheetId="s1" teacherName="Каримова К." month="2026-11" state={props.state} onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "assign":
      if (props.moneyAvailable) usePaymentsSummary.setState({ available: true, loaded: true });
      root.render(<AssignGroupModal open studentId="st1" studentName="Иванов Иван" mode="transfer" currentGroupId="g1" currentGroupName="7-А Алгебра" onClose={() => log("close")} onAssigned={() => log("assigned")} />);
      break;
    case "openLessons":
      root.render(<OpenLessonsView groupsBasePath="/owner/groups" />);
      break;
    case "decided":
      root.render(<DecidedOneOffsBlock showToast={(text: string) => log(`toast:${text}`)} onChanged={() => log("changed")} />);
      break;
    case "decisionsToast":
      root.render(<DecisionsWithToast items={props.items} />);
      break;
    case "monthRows": {
      // the list of the month as the page draws it, in a box as wide as the content area of the screen (the test chooses the width and the viewport)
      const teachers = props.teachers as any[];
      root.render((
        <div style={{ width: props.width ?? (window.innerWidth >= 1280 ? 1000 : window.innerWidth >= 1024 ? 740 : window.innerWidth - 32) }} className="mx-auto space-y-2 py-2">
          <PayrollMonthSummary totals={monthTotals("2026-11", teachers, props.open !== false)} month="2026-11" open={props.open !== false} />
          <div className="xl:overflow-hidden xl:rounded-2xl xl:border xl:border-slate-200 xl:bg-white">
            <TableHeader show="xl" gridClass={MONTH_COLUMNS.grid} labels={MONTH_COLUMNS.labels} aligns={MONTH_COLUMNS.aligns} />
            <ul className="space-y-3 xl:space-y-0 xl:divide-y xl:divide-slate-100">
              {teachers.map((teacher) => <TeacherRow key={teacher.teacher_id} teacher={teacher} month="2026-11" period={monthPeriodView(periodView(teacher.__period), props.open !== false)} busy={false} onCalculate={() => {}} onOpen={() => {}} />)}
            </ul>
          </div>
        </div>
      ));
      break;
    }
    case "journal":
      root.render(<GroupAttendanceJournal groupId="g1" students={props.students ?? []} canEdit adminMode groupName="7-А Алгебра" initialMonth={props.month ?? null} />);
      break;
    case "monthPage":
      root.render(<PayrollMonthPage />);
      break;
    case "sheetPage":
      root.render(<PayrollSheetPage sheetId="s1" />);
      break;
    case "decisions":
      root.render(<OneOffDecisionsBlock items={props.items} loading={false} error={null} canDecide={props.canDecide !== false} rightLost={false} onRightLost={() => log("right-lost")} onRetry={() => log("retry")} onDecided={(id: string) => log(`decided:${id}`)} showToast={(text: string) => log(`toast:${text}`)} />);
      break;
    case "closedMonth":
      root.render(<ClosedMonthProbe />);
      break;
    default:
      noop();
  }
};
