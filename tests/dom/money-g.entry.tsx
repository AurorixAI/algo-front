// Money-1 / Г front: the windows of the pack «Г» in a real DOM - the REAL components and hooks, the server answered by the test through `route`.
import React from "react";
import { createRoot } from "react-dom/client";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";
import { CancelMissedLessonModal } from "@/components/attendance/cancel-missed-lesson-modal";
import { DecisionDialog } from "@/components/substitutions/decision-dialog";
import { BulkDialog } from "@/components/substitutions/bulk-dialog";
import { useAuthStore } from "@/lib/store";

const w = window as any;
w.__log = [] as string[];
const log = (text: string) => w.__log.push(text);

const ITEM = (id: string, date: string) => ({
  id, status: "pending", group: { id: "g1", name: "Алгебра 7 (вт/пт)" },
  lesson: { lessonId: `l-${id}`, date, startTime: "16:00", endTime: "17:00", format: "offline" },
  teacher: { id: "t1", name: "Каримова Дилдора Рустамовна" }, reasonCode: "illness", minutesToStart: 3000, urgent: false, overdue: false,
});

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "cancelMissed":
      root.render(<CancelMissedLessonModal target={{ groupId: "g1", lessonId: "l1", lessonDate: "2026-11-03" }} onClose={() => log("close")} onCancelled={(target, notes) => log(`cancelled:${target.lessonDate}:${notes.join("|")}`)} />);
      break;
    case "sheetCancel":
      root.render(<LessonActionSheet
        lesson={{ id: "l1", date: "2099-11-20", startTime: "16:00", endTime: "17:00", status: "scheduled" } as never}
        groupId="g1" title="Алгебра 7 (вт/пт)" subtitle="пт, 20 ноября · 16:00–17:00" teacherLine={null} actions={(props.actions ?? ["assign", "reschedule", "cancel"]) as never} assignLabel="Назначить замену"
        onClose={() => log("close")} onChanged={(text: string) => log(`changed:${text}`)} />);
      break;
    case "decision":
      root.render(<DecisionDialog item={ITEM("r1", "2099-11-20") as never} role={props.role ?? "admin"} onClose={() => log("close")} onDecided={() => log("decided")} onStale={() => log("stale")} />);
      break;
    case "bulk":
      root.render(<BulkDialog kind="cancel" items={(props.dates as string[]).map((date, index) => ITEM(`r${index + 1}`, date)) as never} role="admin" onClose={() => log("close")} onDone={() => log("done")} />);
      break;
    default:
      break;
  }
};
