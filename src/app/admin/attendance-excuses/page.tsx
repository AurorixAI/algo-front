"use client";

import { ExcusesPage } from "@/components/attendance/excuses-page";

export default function AdminAttendanceExcusesPage() {
  // The student profile lives under /admin for both roles (the admin layout admits owners).
  return <ExcusesPage studentProfileBasePath="/admin/students" />;
}
