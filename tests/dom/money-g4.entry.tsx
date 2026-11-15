// «Деньги-1 / Г», круг 4: цена ученика и группы на каждом экране — настоящие компоненты, ответ сервера даёт тест.
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentsPage } from "@/components/payments/payments-page";
import { AddStudentDrawer } from "@/components/groups/add-student-drawer";
import { GroupPaymentsTab } from "@/components/groups/group-payments-tab";
import { IndividualPriceDialog, MembershipPriceLine } from "@/components/payments/membership-price";
import { OpeningsGroups } from "@/components/payments/openings-rows";
import { normalizeRow } from "@/lib/openings";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__log = [] as string[];

w.mount = (name: string, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "owner", org_role: "owner" } as never, isAuthenticated: true });
  usePaymentsSummary.setState({ available: true, loaded: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "payments":
      root.render(<PaymentsPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />);
      break;
    case "drawer":
      root.render(<AddStudentDrawer open groupId="g1" groupClassLevel={7} groupPrice={null} groupScheduledPrice={props.scheduled ?? null} groupsBasePath="/owner/groups" existingStudentIds={new Set()} onClose={() => {}} onAdded={() => {}} />);
      break;
    case "groupTab":
      root.render(<GroupPaymentsTab groupId="g1" groupName="Алгебра 7" groupPrice={null} groupScheduledPrice={props.scheduled ?? null} groupsBasePath="/owner/groups" studentsBasePath="/owner/students" paymentsBasePath="/owner/payments" joinedAt={{}} filter="all" onFilterChange={() => {}} />);
      break;
    case "priceLine":
      root.render(<MembershipPriceLine row={props.row} periodMode={"calendar" as never} groupsBasePath="/owner/groups" />);
      break;
    case "individual":
      root.render(<IndividualPriceDialog open row={props.row} studentName="Иванов Иван" periodMode={"calendar" as never} onClose={() => {}} onRowChange={() => {}} onNotify={() => {}} />);
      break;
    case "openings": {
      const rows = (props.rows as any[]).map(normalizeRow);
      root.render(
        <div className="mx-auto max-w-[1280px] p-4">
          <OpeningsGroups
            groups={[{ id: "g1", name: "Алгебра 7", teacher_name: null, total: rows.length, with_opening: 0, missing: rows.length, memberships: rows }]}
            drafts={{}} problems={{}} arrows={{}} selected={new Set()} openIds={new Set(["g1"])} accountingStart="2026-09-01" paidUntilMax="2026-12-31" studentsBase="/owner/students"
            onToggleOpen={() => {}} onToggleRow={() => {}} onToggleGroup={() => {}} onEdit={() => {}} onUndo={() => {}}
          />
        </div>,
      );
      break;
    }
    default:
      break;
  }
};
