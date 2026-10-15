"use client";

import { AttendanceSection } from "@/components/attendance/attendance-section";

export default function OwnerAttendancePage() {
  return <AttendanceSection studentProfileBasePath="/owner/students" groupsBasePath="/owner/groups" />;
}
