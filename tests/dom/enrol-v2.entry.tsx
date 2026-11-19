// Windows of enrolment by the owner's mock-up (money-2-front, 19.11): the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { AddStudentDrawer, type AddStudentsResult } from "@/components/groups/add-student-drawer";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";
import { useToast } from "@/components/ui/toast";
import { enrolToast } from "@/lib/group-enrol";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

/** The drawer as the group page mounts it: after the write the window closes and the page shows ONE message (the real toast). */
function DrawerDemo({ props }: { props: any }) {
  const { showToast, toastNode } = useToast();
  const [open, setOpen] = React.useState(true);
  const done = (result: AddStudentsResult) => { setOpen(false); log(`added:${JSON.stringify(result)}`); const toast = enrolToast(result); showToast(toast.text, toast.type, toast.details); };
  return (
    <>
      <AddStudentDrawer open={open} groupId="g2" groupName={props.groupName} groupClassLevel={7} groupPrice={props.groupPrice} groupScheduledPrice={props.groupScheduledPrice} groupsBasePath="/owner/groups" existingStudentIds={new Set(props.existing ?? [])} onClose={() => { log("close"); setOpen(false); }} onAdded={done} />
      {toastNode}
    </>
  );
}

function CardDemo({ props }: { props: any }) {
  const { showToast, toastNode } = useToast();
  const [open, setOpen] = React.useState(true);
  return (
    <>
      <AssignGroupModal open={open} studentId="st1" studentName={props.studentName ?? "Анвар Каримов"} studentGrade={7} mode={props.mode ?? "add"} currentGroupId={props.currentGroupId ?? null} currentGroupName={props.currentGroupName ?? null} excludeGroupIds={props.excludeGroupIds} sourceGroups={props.sourceGroups} groupsBasePath="/owner/groups" onClose={() => { log("close"); setOpen(false); }} onAssigned={(_group, done) => { log("assigned"); if (done) showToast(done.text, done.type, done.details); }} />
      {toastNode}
    </>
  );
}

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  usePaymentsSummary.setState({ available: props.money !== false, loaded: true, accountingStart: "2026-09-01", ...(props.summary ?? {}) } as never);
  const root = createRoot(document.getElementById("root")!);
  root.render(name === "card" ? <CardDemo props={props} /> : <DrawerDemo props={props} />);
};
