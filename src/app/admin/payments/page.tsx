"use client";

import { PaymentsPage } from "@/components/payments/payments-page";

export default function AdminPaymentsPage() {
  // Reachable only while the owner allowed administrators to manage payments (the server decides).
  return <PaymentsPage studentProfileBasePath="/admin/students" />;
}
