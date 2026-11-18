// Money-2 fix 9: the pages of the section «Оплаты» opened by a direct link (the REAL page components, the server answered by the test through `route`).
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentsPage } from "@/components/payments/payments-page";
import { IncomePage } from "@/components/payments/income-page";
import { OpeningsPage } from "@/components/payments/openings-page";
import { GroupPricesPage } from "@/components/payments/group-prices-page";
import { ReceiptView } from "@/components/payments/receipt-view";
import { RefundReceiptView } from "@/components/payments/refund-receipt-view";
import { StatementView } from "@/components/payments/statement-view";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__summary = usePaymentsSummary;
w.mount = (name: string, user: Record<string, unknown>) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  w.__params = { id: "m-a" };
  const base = String(user.role) === "admin" ? "/admin" : "/owner";
  const root = createRoot(document.getElementById("root")!);
  const page = (node: React.ReactNode) => root.render(<div className="mx-auto max-w-[1100px] p-4">{node}</div>);
  switch (name) {
    case "payments": page(<PaymentsPage studentProfileBasePath={`${base}/students`} groupsBasePath={`${base}/groups`} />); break;
    case "income": page(<IncomePage paymentsHref={`${base}/payments`} studentProfileBasePath={`${base}/students`} />); break;
    case "openings": page(<OpeningsPage paymentsHref={`${base}/payments`} />); break;
    case "prices": page(<GroupPricesPage paymentsHref={`${base}/payments`} groupsBasePath={`${base}/groups`} />); break;
    case "receipt": page(<ReceiptView paymentsHref={`${base}/payments`} />); break;
    case "refund-receipt": page(<RefundReceiptView paymentsHref={`${base}/payments`} />); break;
    case "statement": page(<StatementView paymentsHref={`${base}/payments`} />); break;
  }
};
