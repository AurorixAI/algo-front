// «Деньги-1 / Б» in a real DOM: the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { AddStudentDrawer } from "@/components/groups/add-student-drawer";
import { GroupPriceDialog } from "@/components/groups/group-price-dialog";
import { GroupCreateModal } from "@/components/groups/group-create-modal";
import { RegimeChangeDialog } from "@/components/settings/regime-change-dialog";
import { PaymentsHistory } from "@/components/settings/payments-history";
import { PaymentsPage } from "@/components/payments/payments-page";
import { PaymentsAlertBanner } from "@/components/payments/payments-alert-banner";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { useAuthStore } from "@/lib/store";
import { usePaymentsSummary } from "@/lib/payments-summary";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  if (props.summary) usePaymentsSummary.setState({ available: true, loaded: true, ...props.summary });
  if (props.refresh) void usePaymentsSummary.getState().refresh(true);
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "addDrawer":
      root.render(<AddStudentDrawer open groupId="g2" groupClassLevel={7} existingStudentIds={new Set()} onClose={() => log("close")} onAdded={(result) => log(JSON.stringify(result))} />);
      break;
    case "priceDialog":
      root.render(<GroupPriceDialog open groupId="g1" groupName="Алгебра 7" label="Цена в месяц" current={{ amount: 600000, valid_from: "2026-09-01" } as never} history={[]} onClose={() => log("close")} onSaved={() => log("saved")} onConflict={() => log("conflict")} />);
      break;
    case "groupCreate":
      root.render(<GroupCreateModal open teachers={[]} onClose={() => log("close")} onCreated={() => log("created")} selfAssignTeacher={Boolean(props.self)} />);
      break;
    case "regime":
      root.render(<RegimeChangeDialog open changes={props.changes} saving={false} onConfirm={() => log("confirm")} onClose={() => log("close")} />);
      break;
    case "history":
      root.render(<div className="mx-auto max-w-2xl p-4"><PaymentsHistory /></div>);
      break;
    case "payments":
      w.__search = props.search ?? "";
      root.render(<PaymentsPage studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />);
      break;
    case "banner":
      root.render(<div className="mx-auto max-w-3xl p-4"><PaymentsAlertBanner paymentsBasePath="/owner/payments" /></div>);
      break;
    case "till":
      root.render(<PaymentDialog open kind="create" membership={{ membership_id: "m1", group_id: "g1", student_name: "Иванов Иван", group_name: "7-А Алгебра" } as never} onClose={() => log("close")} onSaved={() => log("saved")} onDuplicate={() => log("duplicate")} />);
      break;
    default:
      break;
  }
};
