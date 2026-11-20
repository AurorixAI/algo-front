// PAY-DUE part 5 (screens after the walk M18): the cards of money in a real DOM, inside the SAME frame as the product (the sidebar takes 240 px - open, 68 px - folded, from 768 up).
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentsPage } from "@/components/payments/payments-page";
import { IncomePage } from "@/components/payments/income-page";
import OwnerDashboard from "@/app/owner/dashboard/page";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "Лид", last_name: "Тестов", full_name: "Лид Тестов", ...user } as never, isAuthenticated: true, org: null } as never);
  if (name === "dashboard") { usePaymentsSummary.setState({ available: true, loaded: true }); void usePaymentsSummary.getState().refresh(true); }
  const root = createRoot(document.getElementById("root")!);
  w.__search = props.search ?? "";
  // the main area of the owner's layout: `md:ml-[240px|68px] p-4 md:p-8`
  const shell = (node: React.ReactNode) => root.render(
    <div className="min-h-screen bg-background">
      <main className="min-w-0 p-4 md:p-8" style={{ marginLeft: window.innerWidth >= 768 ? (props.sidebar === 68 ? 68 : 240) : 0 }}>{node}</main>
    </div>,
  );
  switch (name) {
    case "payments": shell(<PaymentsPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />); break;
    case "income": shell(<IncomePage paymentsHref="/owner/payments" studentProfileBasePath="/owner/students" />); break;
    case "dashboard": shell(<OwnerDashboard />); break;
    default: break;
  }
};
