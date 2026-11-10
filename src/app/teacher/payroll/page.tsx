"use client";

import { MyPayrollView } from "@/components/teacher/my-payroll-view";

export default function TeacherPayrollPage() {
  // The teacher only: the /teacher layout guard turns everybody else away, and the server answers 403 to them anyway.
  return <MyPayrollView />;
}
