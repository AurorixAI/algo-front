// PAY-DUE, screens part 1, in a real DOM: the REAL components (the list «Оплаты», the settings, the panel, the group, the student's card), the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentsPage } from "@/components/payments/payments-page";
import OwnerSettingsPage from "@/app/owner/settings/page";
import AdminSettingsPage from "@/app/admin/settings/page";
import OwnerDashboard from "@/app/owner/dashboard/page";
import { GroupDetailView } from "@/components/groups/group-detail-view";
import { StudentProfileView } from "@/components/students/student-profile-view";
import { Sidebar } from "@/components/layout/sidebar";
import { StatusChip } from "@/components/ui/chip";
import { PAY_STATE_TONE } from "@/lib/pay-state";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__log = [] as string[];

/** Frame 0 of the layout - the map of tones on one strip: the SAME component and the same tone table the screens use. */
function ToneMap() {
  const cells: Array<[string, "debt" | "to_pay" | "paid" | "expiring" | "paused" | "free", string, string]> = [
    ["Долг", "debt", "", "Срок прошёл, сумма не оплачена"],
    ["К оплате", "to_pay", "", "Срок ещё идёт"],
    ["Оплачено до 30.11", "paid", "", "Период оплачен"],
    ["Заканчивается оплата", "expiring", "", "Оплачено, но период скоро кончится"],
    ["Аванс", "paid", "", "Оплачено вперёд"],
    ["Пауза", "paused", "", "Ученик на паузе"],
  ];
  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6" data-testid="tone-map">
      {cells.map(([text, state, , note]) => (
        <div key={text} className="space-y-2 bg-white p-4">
          <StatusChip tone={PAY_STATE_TONE[state]} testId={`tone-${state}`}>{text}</StatusChip>
          <p className="text-sm text-slate-500">{note}</p>
        </div>
      ))}
    </div>
  );
}

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "Лид", last_name: "Тестов", full_name: "Лид Тестов", ...user } as never, isAuthenticated: true, org: props.org ?? null } as never);
  if (props.moneyAvailable !== undefined) usePaymentsSummary.setState({ available: Boolean(props.moneyAvailable), loaded: true });
  const root = createRoot(document.getElementById("root")!);
  // the shell (the sidebar) keeps the summary fresh in the product; the screens mounted alone ask for it here
  if (["dashboard", "adminSettings", "settings", "group", "student"].includes(name)) void usePaymentsSummary.getState().refresh(true);
  const page = (node: React.ReactNode) => root.render(<div className="min-h-screen bg-background p-4 md:p-8"><div className="mx-auto max-w-[1400px]">{node}</div></div>);
  switch (name) {
    case "toneMap": root.render(<div className="p-4"><ToneMap /></div>); break;
    case "payments":
      w.__search = props.search ?? "";
      page(<PaymentsPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />);
      break;
    case "paymentsAdmin":
      w.__search = props.search ?? "";
      page(<PaymentsPage studentProfileBasePath="/admin/students" groupsBasePath="/admin/groups" />);
      break;
    case "settings": w.__search = "section=payments"; root.render(<div className="mx-auto max-w-5xl p-4 md:p-8"><OwnerSettingsPage /></div>); break;
    case "adminSettings": root.render(<div className="mx-auto max-w-5xl p-4 md:p-8"><AdminSettingsPage /></div>); break;
    case "dashboard": page(<OwnerDashboard />); break;
    case "sidebar": root.render(<Sidebar />); break;
    case "group": w.__params = { id: "g1" }; w.__search = props.search ?? ""; root.render(<div className="mx-auto max-w-[1100px] p-4 md:p-8"><GroupDetailView workspace="owner" /></div>); break;
    case "student": w.__params = { id: "st1" }; w.__search = props.search ?? ""; root.render(<div className="mx-auto max-w-[1100px] p-4 md:p-8"><StudentProfileView /></div>); break;
    default: break;
  }
};
