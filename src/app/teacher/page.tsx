import { redirect } from "next/navigation";

// A typed or bookmarked /teacher leads to the home panel of the workspace.  A visitor without a session never gets
// here (middleware sends them to the sign-in with this address as `redirect`); another role is turned away by
// the guard of the panel, exactly as when they open /teacher/dashboard.
export default function Page() {
  redirect("/teacher/dashboard");
}
