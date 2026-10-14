"use client";

import { ExcusesPage } from "@/components/attendance/excuses-page";

export default function OwnerAttendanceExcusesPage() {
  // The student profile lives under /admin for both roles (the admin layout admits owners).
  return <ExcusesPage studentProfileBasePath="/admin/students" />;
}
