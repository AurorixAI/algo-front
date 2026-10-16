import { formatUtcNaiveAsBusinessTime } from "./business-time";

/**
 * Live diagnostic queue of the admin analytics page, aligned to what diagnostic-service
 * `GET /analytics/org/live-queue` really answers (analytics_router.py `_fmt`):
 *
 *   { period_hours, active_count, completed_count,
 *     active:    [ { session_id, student_id, invite_code, grade_level, status, phase, items_answered, theta,
 *                    created_at, completed_at } ],
 *     completed: [ ...same fields... ] }
 *
 * The service sends NO student name, NO diagnostic type, NO started_at: the row shows what exists
 * (invite code, grade, phase, answers, theta, creation / completion time) and never a made-up value.
 * While the route is closed (HTTP 409 until the tenant-isolation migration) `normalizeLiveQueue` is not reached:
 * the page shows `LIVE_QUEUE_UNAVAILABLE`.
 */
export const LIVE_QUEUE_UNAVAILABLE = "Живая очередь временно недоступна";

export interface LiveQueueRow {
  id: string;
  /** The only identifier of the person the service sends: the invite code. */
  code: string;
  classLevel: number | null;
  status: "in_progress" | "completed";
  /** Russian label of the adaptive-test phase of an unfinished session, "" when unknown. */
  phase: string;
  itemsAnswered: number | null;
  /** θ of a finished session; null while it is still running. */
  theta: number | null;
  /** «ЧЧ:ММ» (Tashkent): completion time of a finished session, creation time of a running one. */
  time: string;
}

export interface LiveQueueView {
  active: LiveQueueRow[];
  completed: LiveQueueRow[];
  activeCount: number;
  completedCount: number;
  periodHours: number;
}

const PHASE_LABEL: Record<string, string> = {
  warmup: "разминка",
  navigation: "поиск уровня",
  deep_scan: "углублённая проверка",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function row(raw: unknown, status: "in_progress" | "completed"): LiveQueueRow | null {
  if (!isObject(raw)) return null;
  const id = typeof raw.session_id === "string" && raw.session_id ? raw.session_id : null;
  const code = typeof raw.invite_code === "string" ? raw.invite_code : "";
  if (!id && !code) return null;
  const stamp = status === "completed" ? raw.completed_at ?? raw.created_at : raw.created_at;
  return {
    id: id ?? code,
    code,
    classLevel: finiteNumber(raw.grade_level),
    status,
    phase: status === "in_progress" && typeof raw.phase === "string" ? PHASE_LABEL[raw.phase] ?? "" : "",
    itemsAnswered: finiteNumber(raw.items_answered),
    theta: status === "completed" ? finiteNumber(raw.theta) : null,
    time: formatUtcNaiveAsBusinessTime(typeof stamp === "string" ? stamp : null),
  };
}

function rows(raw: unknown, status: "in_progress" | "completed"): LiveQueueRow[] {
  return Array.isArray(raw) ? raw.map((item) => row(item, status)).filter((item): item is LiveQueueRow => item !== null) : [];
}

/** The service answer as the page shows it; null when the answer is not the queue at all (error body, empty). */
export function normalizeLiveQueue(raw: unknown): LiveQueueView | null {
  if (!isObject(raw) || (!Array.isArray(raw.active) && !Array.isArray(raw.completed))) return null;
  const active = rows(raw.active, "in_progress");
  const completed = rows(raw.completed, "completed");
  return {
    active,
    completed,
    activeCount: finiteNumber(raw.active_count) ?? active.length,
    completedCount: finiteNumber(raw.completed_count) ?? completed.length,
    periodHours: finiteNumber(raw.period_hours) ?? 24,
  };
}

/** «5 кл. · разминка · 12 ответов» - only the parts that exist. */
export function liveQueueDetails(item: LiveQueueRow): string {
  return [
    item.classLevel ? `${item.classLevel} кл.` : "",
    item.phase,
    item.itemsAnswered !== null ? `${item.itemsAnswered} отв.` : "",
  ].filter(Boolean).join(" · ");
}
