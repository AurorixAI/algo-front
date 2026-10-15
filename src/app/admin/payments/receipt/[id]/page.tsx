"use client";

import { ReceiptView } from "@/components/payments/receipt-view";

export default function ReceiptPage() {
  // Reachable only for the owner, or an administrator the owner allowed: the server decides (403 -> a friendly message).
  return <ReceiptView paymentsHref="/admin/payments" />;
}
