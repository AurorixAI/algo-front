// R3 (unconfirmed 4): the windows of the round drawn by the REAL components inside the REAL `Modal` (portal, overlay, focus trap), in headless Chromium with the real Tailwind CSS;
// the server is answered by `tests/dom/shots.cjs` through `route`.  Not a test: `node tests/dom/shots.cjs <out dir>` writes the PNGs of every window at 1280 and 375.
import React from "react";
import { createRoot } from "react-dom/client";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { AddStudentDrawer } from "@/components/groups/add-student-drawer";
import { DaysOffPanel } from "@/components/schedule/days-off-panel";
import { DayOffDialog } from "@/components/schedule/day-off-dialog";
import { SheetPayoutBlock } from "@/components/payroll/payout-block";
import { PayoutDialog } from "@/components/payroll/payout-dialog";
import { ConfirmHost } from "@/components/ui/confirm-host";
import { askConfirm } from "@/lib/confirm-dialog";
import { gateOfConfirmRefusal, openLessonsQuestion } from "@/lib/payroll-open-lessons";
import { useAuthStore } from "@/lib/store";

const w = window as any;
const FRESH = { saved_total: 400000, fresh_total: 600000, target: 600000, paid: 475000, balance: 125000, state: "due", basis: "fresh", changed_by: 200000, change_text: null,
  text: "Месяц открыт: начислено сейчас 600 000 сум, выплачено 475 000 сум, к выплате 125 000 сум", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };

w.mountShot = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  const noop = () => {};
  switch (name) {
    case "pause":
      root.render(<PauseDialog open membershipId="m1" studentName="Иванов Иван" groupName="7-А Алгебра" onClose={noop} onChanged={noop} />);
      break;
    case "addStudent":
      root.render(<AddStudentDrawer open groupId="g2" groupClassLevel={7} existingStudentIds={new Set()} onClose={noop} onAdded={noop} />);
      break;
    case "daysOff":
      root.render(<div className="mx-auto max-w-3xl p-4"><DaysOffPanel /></div>);
      break;
    case "dayOffDialog":
      root.render(<DayOffDialog open onClose={noop} onDone={noop} />);
      break;
    case "payoutBlock":
      root.render(<div className="mx-auto max-w-3xl p-4"><SheetPayoutBlock sheetId="s1" month="2026-11" teacherName="Каримова К." payout={FRESH as never} onChanged={noop} /></div>);
      break;
    case "payoutDialog":
      root.render(<PayoutDialog open sheetId="s1" teacherName="Каримова К." month="2026-11" state={FRESH as never} onClose={noop} onDone={noop} />);
      break;
    case "openLessonsQuestion": {
      root.render(<ConfirmHost />);
      const refusal = { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", message: "x", detail: { message: "В месяце незакрытых уроков, которых вы ещё не подтверждали: 3. Они не попадут в ведомость, а месяц закроется. Сохранить всё равно?", count: 3, alreadyConfirmed: 2,
        items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" }, { lessonDate: "2026-10-14", groupId: "g2", groupName: "9-Б Геометрия", lessonId: "l2", kind: "in_progress" }, { lessonDate: "2026-10-19", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l3", kind: "missed" }] } };
      setTimeout(() => { void askConfirm(openLessonsQuestion(gateOfConfirmRefusal(refusal))!); }, 50);
      break;
    }
    default:
      noop();
  }
};
