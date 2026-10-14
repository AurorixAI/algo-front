"use client";

import { AttendanceSection } from "@/components/attendance/attendance-section";

export default function OwnerAttendancePage() {
  // The student profile lives under /admin for both roles (the admin layout admits owners).
  return <AttendanceSection studentProfileBasePath="/admin/students" groupsBasePath="/owner/groups" />;
}
