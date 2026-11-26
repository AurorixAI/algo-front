// LESSON-RULES: the screens of the package in a real DOM - the REAL components, the server answered by the test through `route` (the answers are the server's own files, tests/fixtures/lessonRules).
import React from "react";
import { createRoot } from "react-dom/client";
import { SubstitutionsPage } from "@/components/substitutions/substitutions-page";
import { useAuthStore } from "@/lib/store";
import { TeacherRequestsBlock } from "@/components/substitutions/teacher-requests-block";
import { NextActionCard } from "@/components/teacher/next-action-card";

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
    default:
      throw new Error(`unknown mount ${name}`);
  }
};
