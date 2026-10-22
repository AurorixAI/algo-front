"use client";

import { OpeningsPage } from "@/components/payments/openings-page";

export default function AdminOpeningsPage() {
  // Reachable only while the owner allowed administrators to manage payments (the server decides: 403 otherwise).
  return <OpeningsPage paymentsHref="/admin/payments" />;
}
