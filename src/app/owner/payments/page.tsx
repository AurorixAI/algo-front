"use client";

import { PaymentsPage } from "@/components/payments/payments-page";

export default function OwnerPaymentsPage() {
  // The student card lives under /admin for both roles (the admin layout admits owners).
  return <PaymentsPage studentProfileBasePath="/admin/students" />;
}
