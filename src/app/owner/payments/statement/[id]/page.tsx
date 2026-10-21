"use client";

import { StatementView } from "@/components/payments/statement-view";

export default function StatementPage() {
  // Reachable only for the owner, or an administrator the owner allowed: the server decides (403 -> a friendly message).
  return <StatementView paymentsHref="/owner/payments" />;
}
