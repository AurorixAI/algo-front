"use client";

import { useParams } from "next/navigation";
import { PayrollSheetPage } from "@/components/payroll/payroll-sheet-page";

export default function OwnerPayrollSheetPage() {
  const params = useParams();
  const raw = params?.sheetId;
  const sheetId = Array.isArray(raw) ? raw[0] : raw;
  return sheetId ? <PayrollSheetPage sheetId={sheetId} /> : null;
}
