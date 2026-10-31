/**
 * exam-service helpers for the @exam scenarios (stack started with E2E_EXAM=1). The tasks come from the content
 * stub (e2e/stubs/content_stub.py): five "Найдите сумму чисел <a> и <b>." tasks (numbers in words) with the answer a + b.
 */
import { randomBytes } from "node:crypto";
import { EXAM_API } from "./env";
import { ApiError, type Session } from "./api";

export const STUB_SKILL_ID = "E2E-SK-1";
/** 20 tasks "Прибавьте 100 к числу i" (key 100 + i), served for this skill only: percentages in steps of 5 % (55 %, 75 %). */
export const STUB_SKILL20_ID = "E2E-SK-2";
/** question text -> the right answer, as the stub serves them */
export const STUB_ANSWERS: Record<string, string> = {
  "Найдите сумму чисел три и четыре.": "7",
  "Найдите сумму чисел восемь и пять.": "13",
  "Найдите сумму чисел шесть и семь.": "13",
  "Найдите сумму чисел девять и девять.": "18",
  "Найдите сумму чисел двенадцать и пять.": "17",
};

export class ExamApi {
  private readonly ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 250)}`;
  constructor(private readonly session: Session) {}

  async call<T = any>(method: string, path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    const url = new URL(`${EXAM_API}${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": this.ip,
        Cookie: this.session.api.cookie ?? "",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path}`, data?.detail ?? data);
    return data as T;
  }

  /** A draft online exam of the stub's tasks for a group (`skillId` STUB_SKILL20_ID: the 20-task pool; `threshold`: the exam's pass threshold, %). */
  async createDraft(opts: { title: string; groupId?: string; tasks?: number; skillId?: string; threshold?: number }) {
    return this.call<{ exam_id: string; status: string; tasks_count: number }>("POST", "/exams/generate", {
      title: opts.title,
      skill_ids: [opts.skillId ?? STUB_SKILL_ID],
      group_id: opts.groupId,
      pass_threshold_pct: opts.threshold,
      tasks_count: opts.tasks ?? 3,
      time_minutes: 20,
      delivery_mode: "online",
      shuffle_options: true,
    });
  }
}

/** A student of the public entry, by API: joins the lobby with the code, waits for the start, submits. No cookies - the attempt token is the capability. */
export class StudentAttempt {
  private readonly ip = `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 250)}`;
  sessionId = "";
  private token = "";

  constructor(private readonly code: string) {}

  private async call<T = any>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${EXAM_API}${path}`, {
      method,
      headers: { "Content-Type": "application/json", "X-Real-IP": this.ip, ...(this.token ? { "X-Exam-Session-Token": this.token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path}`, data?.detail ?? data);
    return data as T;
  }

  /** Enter the lobby with the name and the centre's student ID. */
  async join(studentName: string, displayId: string) {
    const started = await this.call<{ session_id: string; session_token: string; status: string }>("POST", `/exams/by-code/${this.code}/start`, {
      student_name: studentName,
      display_id: displayId,
    });
    this.sessionId = started.session_id;
    this.token = started.session_token;
    return started;
  }

  /** After the teacher's «Начать экзамен» the first status request moves the attempt to «in progress». */
  async waitStarted() {
    for (let i = 0; i < 40; i++) {
      const status = await this.call<{ status: string }>("GET", `/exams/by-code/${this.code}/session-status/${this.sessionId}`);
      if (status.status === "in_progress") return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error("the attempt did not start");
  }

  submit(answers: Record<string, string>) {
    return this.call<{ score: number; max_score: number; percentage: number }>("POST", `/exam-sessions/${this.sessionId}/submit`, { answers, time_spent_seconds: 90 });
  }
}
