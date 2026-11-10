// «Деньги-1 / В» (the money of the students) in a real DOM: the REAL components, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { PaymentDialog } from "@/components/payments/payment-dialog";
import { PaymentVoidModal } from "@/components/payments/payment-void-modal";
import { RecordVoidModal } from "@/components/payments/record-void-modal";
import { WriteoffDialog } from "@/components/payments/writeoff-dialog";
import { RefundDialog } from "@/components/payments/refund-dialog";
import { ReceiptView } from "@/components/payments/receipt-view";
import { RefundReceiptView } from "@/components/payments/refund-receipt-view";
import { IncomeDecisions } from "@/components/payments/income-decisions";
import { IncomePage } from "@/components/payments/income-page";
import { JournalSection } from "@/components/payments/income-journal";
import { periodOf } from "@/lib/payments-income-v2";
import { GroupPriceDialog } from "@/components/groups/group-price-dialog";
import { AssignOverrideDialog } from "@/components/payments/membership-price";
import { OpeningBalanceDialog } from "@/components/payments/opening-balance-dialog";
import { TransferPreviewBlock } from "@/components/groups/transfer-preview-block";
import { OpeningsReviewDialog } from "@/components/payments/openings-dialogs";
import { normalizePreview } from "@/lib/openings";
import { FlowLine } from "@/components/payments/income-parts";
import { normalizeOverview } from "@/lib/payments-income-v2";
import { orgApi } from "@/lib/api";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

const ROW = { membership_id: "m1", student_id: "st1", student_name: "Иванов Иван", group_id: "g1", group_name: "7-А Алгебра", is_primary: true, is_active: true, status: "ok", debt: 350000, refundable: 344000 };
const MEMBERSHIP = { membership_id: "m1", group_id: "g1", student_name: "Иванов Иван", group_name: "7-А Алгебра" };

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "refund":
      root.render(<RefundDialog row={(props.row ?? ROW) as never} studentName="Иванов Иван" onClose={() => log("close")} onDone={(result) => log(`done:${result.refund.receipt_no ?? ""}`)} onDuplicate={() => log("duplicate")} />);
      break;
    case "writeoff":
      root.render(<WriteoffDialog row={(props.row ?? ROW) as never} studentName="Иванов Иван" onClose={() => log("close")} onDone={() => log("done")} onDuplicate={() => log("duplicate")} />);
      break;
    case "voidWriteoff":
      root.render(<RecordVoidModal onClose={() => log("close")} target={{
        key: "w1", title: "Отменить прощение долга?", description: "05.11 · 40 000 сум", action: "Отменить прощение", explain: "Прощённая сумма снова станет долгом.",
        expected: 100000, expectedKind: "debt", emptyText: "Долга больше нет", onStale: () => log("stale"),
        run: async (reason, expected) => { await orgApi.voidWriteoff("w1", reason, expected); log("voided"); },
      }} />);
      break;
    case "voidRefund":
      root.render(<RecordVoidModal onClose={() => log("close")} target={{
        key: "r1", title: "Отменить возврат?", description: "05.11 · 100 000 сум", action: "Отменить возврат",
        expected: 0, expectedKind: "advance", emptyText: "Аванса больше нет", onStale: () => log("stale"),
        run: async (reason, expected) => { await orgApi.voidRefund("r1", reason, expected); log("voided"); },
      }} />);
      break;
    case "voidPayment":
      root.render(<PaymentVoidModal payment={{ id: "p1", paid_on: "2026-11-05", amount: 300000 }} studentName="Иванов Иван" onClose={() => log("close")} onVoided={() => log("voided")} onStale={() => log("stale")} />);
      break;
    case "till":
      root.render(<PaymentDialog open kind="create" membership={props.membership ?? MEMBERSHIP} onClose={() => log("close")} onSaved={() => log("saved")} onDuplicate={() => log("duplicate")} />);
      break;
    case "replace":
      root.render(<PaymentDialog open kind="replace" membership={props.membership ?? MEMBERSHIP} payment={props.payment ?? { id: "p1", amount: 400000, paid_on: "2026-11-05", method: "cash", note: null }} onClose={() => log("close")} onSaved={() => log("saved")} onDuplicate={() => log("duplicate")} onStale={() => log("stale")} />);
      break;
    case "receiptPage":
      w.__params = { id: props.id ?? "p1" };
      w.print = () => log("print");
      root.render(<ReceiptView paymentsHref="/owner/payments" />);
      break;
    case "refundReceiptPage":
      w.__params = { id: props.id ?? "r1" };
      w.print = () => log("print");
      root.render(<RefundReceiptView paymentsHref="/owner/payments" />);
      break;
    case "decisions":
      root.render(<div className="mx-auto max-w-[1100px] p-4"><IncomeDecisions period={periodOf("month", "2026-11-10")} authors={props.authors ?? []} paymentsBase="/owner/payments" studentProfileBasePath="/owner/students" /></div>);
      break;
    case "incomePage":
      w.__search = props.search ?? "";
      root.render(<IncomePage paymentsHref="/owner/payments" studentProfileBasePath="/owner/students" />);
      break;
    case "journal":
      root.render(<div className="mx-auto max-w-[1100px] p-4"><JournalSection
        journal={props.journal} loading={false} error={null} onRetry={() => log("retry")} search="" onSearch={() => {}} createdBy="" onCreatedBy={() => {}} authors={[]}
        focusLabel={null} onClearFocus={() => {}} empty={{ kind: "month", focusLabel: null, narrowed: false, year: "2026" }} onResetNarrowing={() => {}} onPage={() => {}}
        onExport={() => log("export")} exporting={false} activeId={null} onOpen={() => {}} showVoided={props.showVoided} onToggleVoided={() => log("toggle")}
        withReplaced={props.withReplaced} onToggleReplaced={() => log("replaced")} /></div>);
      break;
    case "groupPrice":
      root.render(<GroupPriceDialog open groupId="g1" groupName="Алгебра 7" label="Цена в месяц" current={{ amount: 300000, valid_from: "2026-09-01" } as never} history={props.history ?? []} onClose={() => log("close")} onSaved={() => log("saved")} onConflict={() => log("conflict")} />);
      break;
    case "assignOverride":
      root.render(<AssignOverrideDialog open row={{ ...ROW, price: { amount: 300000, source: "group", group_amount: 300000 } } as never} studentName="Иванов Иван" label="Цена в месяц" onClose={() => log("close")} onConflict={() => log("conflict")} onSaved={() => log("saved")} />);
      break;
    case "opening":
      root.render(<OpeningBalanceDialog open membershipId="m1" studentName="Иванов Иван" groupName="7-А Алгебра" opening={null} enrolDate="2026-09-01" accountingStart="2026-09-01" onClose={() => log("close")} onSaved={() => log("saved")} />);
      break;
    case "transferBlock":
      root.render(<div className="mx-auto max-w-[520px] p-4"><TransferPreviewBlock className="" preview={props.preview} onRetry={() => log("retry")} names={props.names ? new Map(Object.entries(props.names)) : undefined} /></div>);
      break;
    case "openingsReview":
      root.render(<OpeningsReviewDialog state={{ phase: "ready", preview: normalizePreview(props.preview), error: null, notice: null, reasonForced: false }} reason="" onReason={() => {}} onSave={() => log("save")} onClose={() => log("close")} onDropErrors={() => {}} />);
      break;
    case "flowLine":
      root.render(<div className="mx-auto max-w-[1100px] p-4"><FlowLine overview={normalizeOverview(props.overview)} onPickKind={() => log("pick")} /></div>);
      break;
    default:
      break;
  }
};
