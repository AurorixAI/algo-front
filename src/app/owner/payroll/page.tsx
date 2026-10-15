"use client";

import { PayrollMonthPage } from "@/components/payroll/payroll-month-page";

export default function OwnerPayrollPage() {
  // Owner only: the /owner layout guard turns everybody else away, and the server answers 403 to them anyway.
  return <PayrollMonthPage />;
}
