// Money-2 wave 1: the windows of transfer / leave / restore / pause / journal in a real DOM - the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { LeaveStudentDialog } from "@/components/groups/leave-student-dialog";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
import { GroupArchiveDialog } from "@/components/groups/group-archive-dialog";
import { StatementView } from "@/components/payments/statement-view";
import { WriteoffDialog } from "@/components/payments/writeoff-dialog";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { IncomeDecisions } from "@/components/payments/income-decisions";
import { periodOf } from "@/lib/payments-income-v2";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  if (props.moneyAvailable !== undefined) usePaymentsSummary.setState({ available: Boolean(props.moneyAvailable), loaded: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "assign":
      root.render(<AssignGroupModal open studentId="st1" studentName="Каримов Фарход" studentGrade={8} mode={props.mode ?? "transfer"} currentGroupId={props.currentGroupId === undefined ? "ga" : props.currentGroupId} currentGroupName={props.currentGroupName ?? "Алгебра"} excludeGroupIds={props.excludeGroupIds} sourceGroups={props.sourceGroups} groupsBasePath={props.groupsBasePath} onClose={() => log("close")} onAssigned={() => log("assigned")} />);
      break;
    case "group-archive":
      root.render(<GroupArchiveDialog open group={{ id: "gz", name: props.groupName ?? "Алгебра 7" }} groupsBasePath={props.groupsBasePath ?? "/owner/groups"} onClose={() => log("close")} onArchived={(message: string) => log(`archived:${message}`)} />);
      break;
    case "leave":
      root.render(<LeaveStudentDialog open groupId="ga" studentId="st1" studentName="Каримов Фарход" onClose={() => log("close")} onLeft={() => log("left")} />);
      break;
    case "archive":
      root.render(<StudentArchiveModal open studentId="st1" studentName="Каримов Фарход" groupNames={props.groupNames ?? []} onClose={() => log("close")} onArchived={() => log("archived")} onStale={() => log("stale")} />);
      break;
    case "statement":
      w.__params = { id: props.membershipId ?? "m-a" };
      root.render(<div className="mx-auto max-w-[1100px] p-4"><StatementView paymentsHref="/owner/payments" /></div>);
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
