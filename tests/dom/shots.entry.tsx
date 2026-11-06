// R3 (unconfirmed 4): the windows of the round drawn by the REAL components inside the REAL `Modal` (portal, overlay, focus trap), in headless Chromium with the real Tailwind CSS;
// the server is answered by `tests/dom/shots.cjs` through `route`.  Not a test: `node tests/dom/shots.cjs <out dir>` writes the PNGs of every window at 1280 and 375.
import React from "react";
import { createRoot } from "react-dom/client";
import { PauseDialog } from "@/components/payments/pause-dialog";
import { AddStudentDrawer } from "@/components/groups/add-student-drawer";
import { DaysOffPanel } from "@/components/schedule/days-off-panel";
import { DayOffDialog } from "@/components/schedule/day-off-dialog";
import { SheetPayoutBlock } from "@/components/payroll/payout-block";
import { SheetSummaryCard } from "@/components/payroll/sheet-summary";
import { sheetCardStatus, monthTotals } from "@/lib/payroll";
import { TeacherRow } from "@/components/payroll/payroll-month-page";
import { PayrollMonthSummary } from "@/components/payroll/month-status";
import { OneOffDecisionsBlock } from "@/components/substitutions/one-off-decisions";
import { PayoutDialog } from "@/components/payroll/payout-dialog";
import { ConfirmHost } from "@/components/ui/confirm-host";
import { askConfirm } from "@/lib/confirm-dialog";
import { gateOfConfirmRefusal, openLessonsQuestion } from "@/lib/payroll-open-lessons";
import { useAuthStore } from "@/lib/store";
import { nobodyCameQuestion, NOBODY_CAME_TEXT } from "@/lib/attendance-ops";

const w = window as any;
const FRESH = { saved_total: 400000, fresh_total: 600000, target: 600000, paid: 475000, balance: 125000, state: "due", basis: "fresh", changed_by: 200000, change_text: null,
  text: "Месяц открыт: начислено сейчас 600 000 сум, выплачено 475 000 сум, к выплате 125 000 сум", items: [], carry_in: 0, carry_used: 0, advance_out: 0 };

// D-2 / D-3 (walk of 05.11): the card on top of a sheet and the block «Выплата» under it, three states of the real stage data
const SHEET = { id: "s1", saved: true, month: "2026-11", period_start: "2026-11-01", period_end: "2026-11-30", month_open: true, teacher_id: "t1", teacher_name: "Эргашев К.", revision: 1,
  percents: { group: "50" }, divisor_default: 12, lines: [], groups: [], total_amount: 45000, counted_total: 3, unpaid_total: 0, pending_excused_total: 0,
  warnings: { open_lessons: null, pending_excused: 0, no_fee: 0, unpaid: 0 }, source_fingerprint: "f", stale: true, note: null, created_by_name: null, created_at: null, updated_by_name: "Рустам Валиев", updated_at: "2026-11-03T05:00:00" };
const ITEM = { id: "p1", sheet_id: "s1", teacher_id: "t1", month: "2026-11", amount: 150000, paid_on: "2026-11-03", method: "cash", note: "аванс", sheet_revision: 1, sheet_total: 45000, created_by_name: "Рустам Валиев", created_at: null, voided_at: null, void_reason: null };
const SHEET_STATES: Record<string, { sheet: Record<string, unknown>; payout: Record<string, unknown>; stale: boolean; delta: number | null }> = {
  sheetOpenOverpaid: { stale: true, delta: 75834, sheet: SHEET, payout: { saved_total: 45000, fresh_total: 120834, target: 120834, paid: 150000, balance: -29166, state: "overpaid", basis: "fresh", changed_by: 75834, change_text: null,
    text: "Месяц открыт: начислено сейчас 120 834, выплачено 150 000: переплачено 29 166", items: [ITEM], carry_in: 0, carry_used: 0, advance_out: 0 } },
  sheetClosedOverpaid: { stale: false, delta: null, sheet: { ...SHEET, month: "2026-09", month_open: false, total_amount: 860000, stale: false, updated_at: "2026-11-05T03:32:00" }, payout: { saved_total: 860000, fresh_total: 860000, target: 860000, paid: 876666, balance: -16666, state: "overpaid", basis: "saved", changed_by: 0, change_text: null,
    text: "Переплачено 16 666", items: [{ ...ITEM, amount: 876666, paid_on: "2026-10-03", note: "выплачено полностью" }], carry_in: 0, carry_used: 0, advance_out: 16666 } },
  sheetClosedPart: { stale: false, delta: null, sheet: { ...SHEET, month: "2026-09", month_open: false, total_amount: 993333, stale: false, updated_at: "2026-11-05T05:10:00" }, payout: { saved_total: 993333, fresh_total: 993333, target: 993333, paid: 876666, balance: 116667, state: "due", basis: "saved", changed_by: 0, change_text: null,
    text: "Выплачено 876 666 из 993 333 · осталось 116 667", items: [{ ...ITEM, amount: 876666, paid_on: "2026-10-03", note: "выплачено полностью" }], carry_in: 0, carry_used: 0, advance_out: 0 } },
};

// D-4 (walk of 05.11): the queue of the additional lessons, one row open for decision, one in a closed month
const QUEUE = (over: Record<string, unknown> = {}) => ({ lessonId: "l1", groupId: "g1", groupName: "7-А Алгебра", lessonDate: "2026-11-03", startTime: "16:00", endTime: "17:00", purpose: "extra", title: "Дополнительный урок — оплатить преподавателю?",
  teacher: { id: "t1", name: "Каримова К." }, createdBy: { id: "o1", name: "Арслан", role: "owner" }, studentsPresent: 2, studentsTotal: 3, studentsPaid: 3, moneyEstimate: { amount: 125000, reason: null }, payrollSheet: { month: "2026-11", status: "unpaid" }, periodClosed: false, ...over });
// D-2 list: the month of the walk - November is open (saved 45 000, accrued 120 834, paid 150 000), September is closed
const ROW_OPEN = { teacher_id: "t1", teacher_name: "Эргашев К.", lessons_count: 9, lesson_types: [], rates: { group: "50" }, missing_rates: [], warnings: {}, sheet: { id: "s1", revision: 1, total_amount: 45000, stale: true, updated_at: "2026-11-03T05:00:00" },
  payout: { saved_total: 45000, fresh_total: 120834, target: 120834, paid: 150000, balance: -29166, state: "overpaid", basis: "fresh", changed_by: 75834, change_text: null, text: "Месяц открыт: начислено сейчас 120 834, выплачено 150 000: переплачено 29 166", items: [], carry_in: 0, carry_used: 0, advance_out: 0 } };
const ROW_SECOND = { ...ROW_OPEN, teacher_id: "t2", teacher_name: "Назарова С.", lessons_count: 4, sheet: { id: "s2", revision: 1, total_amount: 60000, stale: false, updated_at: "2026-11-03T05:00:00" },
  payout: { ...ROW_OPEN.payout, saved_total: 60000, fresh_total: 60000, target: 60000, paid: 0, balance: 60000, state: "unpaid", changed_by: 0, text: "Месяц открыт: начислено сейчас 60 000, выплат нет, к выплате 60 000" } };

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
      const refusal = { status: 409, code: "OPEN_LESSONS_CONFIRM_REQUIRED", message: "x", detail: { message: "Уроков без отметки, которых вы ещё не подтверждали: 3. Они не попадут в зарплату, а месяц закроется. Сохранить всё равно?", count: 3, alreadyConfirmed: 2,
        items: [{ lessonDate: "2026-10-12", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l1", kind: "missed" }, { lessonDate: "2026-10-14", groupId: "g2", groupName: "9-Б Геометрия", lessonId: "l2", kind: "in_progress" }, { lessonDate: "2026-10-19", groupId: "g1", groupName: "7-А Алгебра", lessonId: "l3", kind: "missed" }] } };
      setTimeout(() => { void askConfirm(openLessonsQuestion(gateOfConfirmRefusal(refusal))!); }, 50);
      break;
    }
    case "nobodyCame": {
      root.render(<ConfirmHost />);
      setTimeout(() => { void askConfirm(nobodyCameQuestion(NOBODY_CAME_TEXT, { date: "2026-11-03", startTime: "16:00", endTime: "17:00", groupName: "7-А Алгебра" })); }, 50);
      break;
    }
    case "sheetReopened": {
      const sheet = { ...SHEET, month: "2026-10", month_open: false, total_amount: 475000, stale: false, updated_at: "2026-11-03T05:00:00",
        payout: { saved_total: 475000, fresh_total: 475000, target: 475000, paid: 0, balance: 475000, state: "unpaid", basis: "saved", changed_by: 0, change_text: null, text: "Не выплачено", items: [], carry_in: 0, carry_used: 0, advance_out: 0 } };
      const status = sheetCardStatus({ saved: true, stale: false, dirty: false, updatedAt: String(sheet.updated_at), delta: null, reopened: true });
      root.render((
        <div className="mx-auto max-w-[1100px] space-y-5 p-4">
          <SheetSummaryCard sheet={sheet as never} total={475000} accrued={0} status={status} savedBy="Рустам Валиев" busy={false} onPrimary={noop} onPrint={noop} onExcel={noop}
            period={{ tone: "reopened", label: "Месяц переоткрыт", hint: "", canReopen: false }} onReopen={noop} />
          <SheetPayoutBlock sheetId="s1" month="2026-10" teacherName="Эргашев К." payout={sheet.payout as never} onChanged={noop} />
        </div>
      ));
      break;
    }
    case "sheetOpenOverpaid":
    case "sheetClosedOverpaid":
    case "sheetClosedPart": {
      const state = SHEET_STATES[name];
      const status = sheetCardStatus({ saved: true, stale: state.stale, dirty: false, updatedAt: String(state.sheet.updated_at), delta: state.delta });
      root.render((
        <div className="mx-auto max-w-[1100px] space-y-5 p-4">
          <SheetSummaryCard sheet={{ ...state.sheet, payout: state.payout } as never} total={Number(state.sheet.total_amount)} accrued={0} status={status} savedBy="Рустам Валиев" busy={false} onPrimary={noop} onPrint={noop} onExcel={noop}
            period={state.sheet.month_open ? { tone: "open", label: "Месяц открыт", hint: "", canReopen: false } : { tone: "closed", label: "Месяц закрыт", hint: "", canReopen: true }} onReopen={noop} />
          <SheetPayoutBlock sheetId="s1" month={String(state.sheet.month)} teacherName="Эргашев К." payout={state.payout as never} onChanged={noop} />
        </div>
      ));
      break;
    }
    case "queue":
      root.render(<div className="mx-auto max-w-3xl p-4"><OneOffDecisionsBlock items={[QUEUE(), QUEUE({ lessonId: "l2", groupName: "9-Б Геометрия", periodClosed: true, teacher: { id: "t2", name: "Назарова С." } })] as never} loading={false} error={null} canDecide rightLost={false} onRightLost={noop} onRetry={noop} onDecided={noop} showToast={noop} /></div>);
      break;
    case "queueClosedInWindow":
      root.render(<div className="mx-auto max-w-3xl p-4"><OneOffDecisionsBlock items={[QUEUE({ lessonId: "l9" })] as never} loading={false} error={null} canDecide rightLost={false} onRightLost={noop} onRetry={noop} onDecided={noop} showToast={noop} /></div>);
      break;
    case "monthList": {
      const teachers = [ROW_OPEN, ROW_SECOND] as never[];
      root.render((
        <div className="mx-auto max-w-[1100px] space-y-3 p-4">
          <PayrollMonthSummary totals={monthTotals("2026-11", teachers, true)} month="2026-11" open />
          <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {teachers.map((teacher: any) => <TeacherRow key={teacher.teacher_id} teacher={teacher} month="2026-11" busy={false} onCalculate={noop} onOpen={noop} />)}
          </ul>
        </div>
      ));
      break;
    }
    default:
      noop();
  }
};
