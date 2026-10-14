import { redirect } from "next/navigation";

// Old bookmarks of the excused-absences page.
export default function LegacyOwnerAttendanceExcusesRedirect() {
  redirect("/owner/attendance?tab=excuses");
}
