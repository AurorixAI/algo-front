import { redirect } from "next/navigation";

// Old bookmarks of the excused-absences page.
export default function LegacyAdminAttendanceExcusesRedirect() {
  redirect("/admin/attendance?tab=excuses");
}
