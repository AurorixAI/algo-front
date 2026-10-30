/**
 * exam-service helpers for the @exam scenarios (stack started with E2E_EXAM=1). The tasks come from the content
 * stub (e2e/stubs/content_stub.py): five "Найдите сумму чисел <a> и <b>." tasks (numbers in words) with the answer a + b.
 */
import { randomBytes } from "node:crypto";
import { EXAM_API } from "./env";
import { ApiError, type Session } from "./api";

export const STUB_SKILL_ID = "E2E-SK-1";
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

  /** A draft online exam of the stub's tasks for a group. */
  async createDraft(opts: { title: string; groupId: string; tasks?: number }) {
    return this.call<{ exam_id: string; status: string; tasks_count: number }>("POST", "/exams/generate", {
      title: opts.title,
      skill_ids: [STUB_SKILL_ID],
      group_id: opts.groupId,
      tasks_count: opts.tasks ?? 3,
      time_minutes: 20,
      delivery_mode: "online",
      shuffle_options: true,
    });
  }
}
