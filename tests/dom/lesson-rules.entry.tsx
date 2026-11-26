// LESSON-RULES: the screens of the package in a real DOM - the REAL components, the server answered by the test through `route` (the answers are the server's own files, tests/fixtures/lessonRules).
import React from "react";
import { createRoot } from "react-dom/client";
import { SubstitutionsPage } from "@/components/substitutions/substitutions-page";
import { useAuthStore } from "@/lib/store";
import { TeacherRequestsBlock } from "@/components/substitutions/teacher-requests-block";
import { NextActionCard } from "@/components/teacher/next-action-card";
import { LessonRulesSection } from "@/components/settings/lesson-rules-section";
import { LessonCancelPanel } from "@/components/substitutions/lesson-cancel-panel";
import { LessonPanelError } from "@/components/attendance/lesson-panel-error";
import { SheetWaitingNotice } from "@/components/groups/sheet-waiting-notice";
import { SheetTodoBlock } from "@/components/payroll/sheet-todo";
import { sheetTodoItems } from "@/lib/payroll";

const w = window as any;
w.__log = [] as string[];

w.mount = (name: string, user: Record<string, unknown> = { role: "owner", org_role: "owner" }, props: any = {}) => {
  useAuthStore.setState({ user: { id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", ...user } as never, isAuthenticated: true });
  const root = createRoot(document.getElementById("root")!);
  switch (name) {
    case "substitutions":
      root.render(<SubstitutionsPage role={props.role ?? "owner"} />);
      break;
    case "teacher-block":
      root.render(<TeacherRequestsBlock refreshKey={0} onNewRequest={() => w.__log.push("new-request")} onChanged={() => w.__log.push("changed")} />);
      break;
    case "next-card":
      root.render(<NextActionCard step={props.step} hint={null} onOpenAction={() => w.__log.push("open-action")} onOpenLesson={() => w.__log.push("open-lesson")} onRetry={() => w.__log.push("retry")} />);
      break;
    case "cancel-panel":
      root.render(<div className="mx-auto max-w-sm rounded-3xl bg-white p-5 shadow-card"><p className="mb-3 text-base font-bold text-slate-900">Пропущенный урок</p><LessonCancelPanel autoFocus pastLesson consequence={props.consequence ?? null} date={props.date} reason={props.reason ?? ""} onReason={() => {}} busy={false} onConfirm={() => w.__log.push("confirm")} onBack={() => w.__log.push("back")} /></div>);
      break;
    case "rule-notice":
      root.render(<div className="mx-auto max-w-sm p-4"><LessonPanelError message={props.message} info={props.info === true} /></div>);
      break;
    case "sheet-waiting":
      root.render(<div className="mx-auto max-w-sm p-4"><SheetWaitingNotice kind={props.kind} groupId="g1" title="Г" lesson={{ id: "lesson-mon", date: "2026-11-23", startTime: "10:00", endTime: "11:30" }} moneyRight={props.moneyRight === true} onDecided={() => w.__log.push("decided")} /></div>);
      break;
    case "lesson-rules":
      root.render(<div className="mx-auto max-w-3xl p-4"><LessonRulesSection /></div>);
      break;
    case "sheet-todo":
      root.render(<div className="mx-auto max-w-3xl p-4"><SheetTodoBlock items={sheetTodoItems({ counts: props.counts })} /></div>);
      break;
    default:
      throw new Error(`unknown mount ${name}`);
  }
};
