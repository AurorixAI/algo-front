"use client";

import { RefundReceiptView } from "@/components/payments/refund-receipt-view";

export default function RefundReceiptPage() {
  // Reachable only for the owner, or an administrator the owner allowed: the server decides (403 -> a friendly message).
  return <RefundReceiptView paymentsHref="/admin/payments" />;
}
