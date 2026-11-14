// The tab «Оплаты» of a group in a real DOM - the REAL tab, the server answered by the test.
import React from "react";
import { createRoot } from "react-dom/client";
import { GroupPaymentsTab } from "@/components/groups/group-payments-tab";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.mountGroupTab = (props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "owner", org_role: "owner" } as never, isAuthenticated: true });
  usePaymentsSummary.setState({ available: true, loaded: true });
  createRoot(document.getElementById("root")!).render(
    <GroupPaymentsTab groupId="g1" groupName="Алгебра 7" groupPrice={null} groupScheduledPrice={props.scheduled ?? null} groupsBasePath="/owner/groups" studentsBasePath="/owner/students" paymentsBasePath="/owner/payments" joinedAt={{}} filter="all" onFilterChange={() => {}} />,
  );
};
