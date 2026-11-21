// Money-2 wave 1: the windows of transfer / leave / restore / pause / journal in a real DOM - the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { LeaveStudentDialog } from "@/components/groups/leave-student-dialog";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
import { archiveResultDetails } from "@/lib/student-archive";
import { GroupArchiveDialog } from "@/components/groups/group-archive-dialog";
import { StatementView } from "@/components/payments/statement-view";
import { WriteoffDialog } from "@/components/payments/writeoff-dialog";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { MembershipRowActions } from "@/components/payments/membership-row-actions";
import { OpeningsPage } from "@/components/payments/openings-page";
import { IncomeDecisions } from "@/components/payments/income-decisions";
import { periodOf } from "@/lib/payments-income-v2";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { useToast } from "@/components/ui/toast";

/** The window as the pages mount it: after a successful write it closes itself and the page shows ONE message (the real toast) - `[data-tone]`. */
function AssignDemo(props: any) {
  const { showToast, toastNode } = useToast();
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <AssignGroupModal open={open} studentId="st1" studentName={props.studentName ?? "Каримов Фарход"} studentGrade={props.studentGrade === undefined ? 8 : props.studentGrade} mode={props.mode ?? "transfer"} currentGroupId={props.currentGroupId === undefined ? "ga" : props.currentGroupId} currentGroupName={props.currentGroupName ?? "Алгебра"} excludeGroupIds={props.excludeGroupIds} sourceGroups={props.sourceGroups} groupsBasePath={props.groupsBasePath} onClose={() => { log("close"); if (props.closeOnDone) setOpen(false); }} onAssigned={(_group, done) => { log("assigned"); if (done) showToast(done.text, done.type, done.details); }} />
      {toastNode}
    </>
  );
}

/** PAY-TAILS frame 8: the leave window and the REAL message after it (the page shows «Ученик убран из группы» and the lines of the result). */
function LeaveToastDemo() {
  const { showToast, toastNode } = useToast();
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <LeaveStudentDialog open={open} groupId="ga" studentId="st1" studentName="Лола Юсупова · Математика 7" onClose={() => setOpen(false)} onLeft={(lines) => showToast("Ученик убран из группы", "success", lines)} onStale={(message) => showToast(message, "error")} />
      {toastNode}
    </>
  );
}

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  if (props.moneyAvailable !== undefined) usePaymentsSummary.setState({ available: Boolean(props.moneyAvailable), loaded: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "assign":
      root.render(<AssignDemo {...props} />);
      break;
    case "group-archive":
      root.render(<GroupArchiveDialog open group={{ id: "gz", name: props.groupName ?? "Алгебра 7" }} groupsBasePath={props.groupsBasePath ?? "/owner/groups"} onClose={() => log("close")} onArchived={(message: string) => log(`archived:${message}`)} />);
      break;
    case "leave":
      root.render(<LeaveStudentDialog open groupId="ga" studentId="st1" studentName="Каримов Фарход" onClose={() => log("close")} onLeft={() => log("left")} />);
      break;
    case "leave-toast":
      root.render(<LeaveToastDemo />);
      break;
    case "leave-lines":
      // PAY-TAILS Б2.4: the message after is the lines of the answer; a stale refusal is said in the server's words
      root.render(<LeaveStudentDialog open groupId="ga" studentId="st1" studentName="Каримов Фарход" onClose={() => log("close")} onLeft={(lines) => log(`left:${lines.join(" | ")}`)} onStale={(message) => log(`stale:${message}`)} />);
      break;
    case "archive-lines":
      root.render(<StudentArchiveModal open studentId="st1" studentName="Каримов Фарход" groupNames={props.groupNames ?? []} onClose={() => log("close")} onArchived={(result) => log(`archived:${archiveResultDetails(result).join(" | ")}`)} onStale={(message) => log(`stale:${message}`)} />);
      break;
    case "archive":
      root.render(<StudentArchiveModal open studentId="st1" studentName="Каримов Фарход" groupNames={props.groupNames ?? []} onClose={() => log("close")} onArchived={() => log("archived")} onStale={() => log("stale")} />);
      break;
    case "statement":
      w.__params = { id: props.membershipId ?? "m-a" };
      root.render(<div className="mx-auto max-w-[1100px] p-4"><StatementView paymentsHref="/owner/payments" /></div>);
      break;
    case "row-actions":
      root.render(<MembershipRowActions row={{ membership_id: "m-a", group_id: "ga", group_name: "Алгебра", debt: 0, advance: 0, is_active: true } as never} studentName="Каримов Фарход" periodMode="calendar" onRowChange={() => log("row")} onNotify={() => log("notify")} label="Действия" paymentsBasePath="/owner/payments" />);
      break;
    case "openings":
      root.render(<div className="mx-auto max-w-[1100px] p-4"><OpeningsPage paymentsHref="/owner/payments" /></div>);
      break;
    case "writeoff":
      root.render(<WriteoffDialog row={{ membership_id: "m-a", group_id: "ga", group_name: props.groupName ?? "Алгебра 7", debt: 190000, advance: 0, is_active: false } as never} studentName="Каримов Фарход" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "pause":
      root.render(<PauseDialog open membershipId="m-a" studentName="Каримов Фарход" groupName={props.groupName ?? "Алгебра"} onClose={() => log("close")} onChanged={(_row, text) => log(`changed:${text}`)} />);
      break;
    case "refund":
      root.render(<RefundDialog row={{ membership_id: "m-a", group_id: "ga", group_name: props.groupName ?? "Алгебра", refundable: 390000, advance: 390000, debt: 0, is_active: false } as never} studentName="Каримов Фарход" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    case "decisions":
      root.render(<div className="mx-auto max-w-[1100px] p-4"><IncomeDecisions period={periodOf("month", "2026-11-10")} authors={props.authors ?? []} paymentsBase="/owner/payments" studentProfileBasePath="/owner/students" /></div>);
      break;
    default:
      break;
  }
};
