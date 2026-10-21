"use client";

import { IncomePage } from "@/components/payments/income-page";

export default function AdminIncomePage() {
  // Reachable only for the owner, or an administrator the owner allowed: the server decides (403 -> a friendly message).
  return <IncomePage paymentsHref="/admin/payments" studentProfileBasePath="/admin/students" />;
}
