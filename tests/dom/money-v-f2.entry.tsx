// «Деньги-1 / В», Ф2: the windows of the payroll and «Моя зарплата» in a real DOM - the REAL components, the server answered by the test through `route` (tests/helpers/dom-page.cjs).
import React from "react";
import { createRoot } from "react-dom/client";
import { TeacherRateDialog } from "@/components/payroll/rate-dialog";
import { RemoveMemberDialog } from "@/components/staff/remove-member-dialog";
import { PayrollSheetTable } from "@/components/payroll/sheet-table";
import { EMPTY_EDITS } from "@/lib/payroll";
import { MyPayrollView } from "@/components/teacher/my-payroll-view";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

const MEMBER = { id: "u9", member_id: "m9", email: "k@e.c", first_name: "Камол", last_name: "Эргашев", org_role: "teacher", is_active: true };

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "rate":
      root.render(<TeacherRateDialog item={props.item} today="2026-11-05" month="2026-11" onClose={() => log("close")} onSaved={() => log("saved")} />);
      break;
    case "remove":
      root.render(<RemoveMemberDialog member={MEMBER as never} action={{ kind: "remove" }} members={[]} onClose={() => log("close")} onDone={(message: string) => log(`done:${message}`)} />);
      break;
    case "myPayroll":
      root.render(<MyPayrollView />);
      break;
    case "sheetTable":
      root.render(<PayrollSheetTable sheet={props.sheet} edits={EMPTY_EDITS} onEdits={() => log("edits")} />);
      break;
    default:
      throw new Error(`no mount ${name}`);
  }
};
