// Money-2 wave 1: the windows of transfer / leave / restore / pause / journal in a real DOM - the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { LeaveStudentDialog } from "@/components/groups/leave-student-dialog";
import { StudentArchiveModal } from "@/components/students/student-archive-modal";
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
      root.render(<AssignGroupModal open studentId="st1" studentName="Каримов Фарход" studentGrade={8} mode={props.mode ?? "transfer"} currentGroupId={props.currentGroupId === undefined ? "ga" : props.currentGroupId} currentGroupName={props.currentGroupName ?? "Алгебра"} excludeGroupIds={props.excludeGroupIds} sourceGroups={props.sourceGroups} onClose={() => log("close")} onAssigned={() => log("assigned")} />);
      break;
    case "leave":
      root.render(<LeaveStudentDialog open groupId="ga" studentId="st1" studentName="Каримов Фарход" onClose={() => log("close")} onLeft={() => log("left")} />);
      break;
    case "archive":
      root.render(<StudentArchiveModal open studentId="st1" studentName="Каримов Фарход" groupNames={props.groupNames ?? []} onClose={() => log("close")} onArchived={() => log("archived")} onStale={() => log("stale")} />);
      break;
    default:
      break;
  }
};
