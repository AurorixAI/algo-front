import type {
  DemoStudent,
  DiagnosticInvite,
  DiagSessionState,
  ExamDraft,
  ExamSession,
  DemoTask,
} from "../types";
import orgFixture from "../fixtures/org.json";
import invitesFixture from "../fixtures/diagnostics/invites.json";
import examsFixture from "../fixtures/exams/seed.json";
import class5Tasks from "../fixtures/tasks/class5.json";
import class6Tasks from "../fixtures/tasks/class6.json";
import class7Tasks from "../fixtures/tasks/class7.json";
import class8Tasks from "../fixtures/tasks/class8.json";

const TASKS_BY_CLASS: Record<number, DemoTask[]> = {
  5: class5Tasks as DemoTask[],
  6: class6Tasks as DemoTask[],
  7: class7Tasks as DemoTask[],
  8: class8Tasks as DemoTask[],
};

type DemoGlobal = {
  initialized: boolean;
  demoState: {
    org: typeof orgFixture;
    students: DemoStudent[];
    invites: DiagnosticInvite[];
    diagSessions: Map<string, DiagSessionState>;
    diagReports: Map<string, Record<string, unknown>>;
    exams: Map<string, ExamDraft>;
    examSessions: Map<string, ExamSession>;
    examCounter: number;
    sessionCounter: number;
    inviteCounter: number;
  };
};

const globalForDemo = globalThis as unknown as { __algoDemo?: DemoGlobal };

function getDemoGlobal(): DemoGlobal {
  if (!globalForDemo.__algoDemo) {
    globalForDemo.__algoDemo = {
      initialized: false,
      demoState: {
        org: orgFixture,
        students: [...(orgFixture.students as DemoStudent[])],
        invites: [],
        diagSessions: new Map<string, DiagSessionState>(),
        diagReports: new Map<string, Record<string, unknown>>(),
        exams: new Map<string, ExamDraft>(),
        examSessions: new Map<string, ExamSession>(),
        examCounter: 100,
        sessionCounter: 1000,
        inviteCounter: 100,
      },
    };
  }
  return globalForDemo.__algoDemo;
}

export const demoState = getDemoGlobal().demoState;

export function initDemoState() {
  const slot = getDemoGlobal();
  if (slot.initialized) return;
  slot.initialized = true;

  demoState.invites = JSON.parse(JSON.stringify(invitesFixture)) as DiagnosticInvite[];

  for (const exam of examsFixture.exams as ExamDraft[]) {
    demoState.exams.set(exam.exam_id, JSON.parse(JSON.stringify(exam)));
  }

  for (const sess of examsFixture.sessions as ExamSession[]) {
    demoState.examSessions.set(sess.session_id, JSON.parse(JSON.stringify(sess)));
  }
}

export function getTasksForClass(classLevel: number): DemoTask[] {
  return TASKS_BY_CLASS[classLevel] ?? TASKS_BY_CLASS[8] ?? [];
}

export function getAllTasks(): DemoTask[] {
  return Object.values(TASKS_BY_CLASS).flat();
}

export function getTaskById(taskId: string): DemoTask | undefined {
  return getAllTasks().find((t) => t.task_id === taskId);
}

export function getTasksBySkillIds(skillIds: string[], classLevel?: number): DemoTask[] {
  const pool = classLevel ? getTasksForClass(classLevel) : getAllTasks();
  if (!skillIds.length) return pool;
  const wanted = new Set(skillIds);
  return pool.filter(
    (t) =>
      wanted.has(t.skill_id) ||
      wanted.has(t.topic_id) ||
      skillIds.some((s) => t.skill_id.startsWith(`${s}_`) || t.skill_id.startsWith(s)),
  );
}

export function getTasksByParagraphIds(paragraphIds: number[], classLevel?: number): DemoTask[] {
  const pool = classLevel ? getTasksForClass(classLevel) : getAllTasks();
  const ids = new Set(paragraphIds.map(Number));
  return pool.filter((t) => t.paragraph_id != null && ids.has(Number(t.paragraph_id)));
}

export function nextExamId(): string {
  demoState.examCounter += 1;
  return `EXAM_DEMO_${demoState.examCounter}`;
}

export function nextSessionId(): string {
  demoState.sessionCounter += 1;
  return `SES_DEMO_${demoState.sessionCounter}`;
}

export function nextInviteId(): string {
  demoState.inviteCounter += 1;
  return `inv-demo-${demoState.inviteCounter}`;
}

export function generateAccessCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "D";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function generateDiagCode(): string {
  return String(100000 + Math.floor(Math.random() * 900000));
}
