import { redirect } from "next/navigation";

// Not built yet (see ROADMAP «Отложенные разделы»): the menu no longer links here,
// and an old bookmark lands on the working home instead of a «Скоро» stub.
export default function Page() {
  redirect("/admin/diagnostics");
}
