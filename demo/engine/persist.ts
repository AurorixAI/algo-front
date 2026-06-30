import fs from "fs";
import path from "path";
import type { DiagnosticInvite, DiagSessionState, ExamDraft, ExamSession } from "../types";

const KV_KEY = "algo-demo:mutable-state";
const TMP_FILE = "/tmp/algo-demo-state.json";
const RUNTIME_FILE = path.join(__dirname, "..", "fixtures", "runtime", "mutable-state.json");

export interface DemoStateSnapshot {
  exams: ExamDraft[];
  examSessions: ExamSession[];
  invites: DiagnosticInvite[];
  diagSessions: Array<[string, DiagSessionState]>;
  diagReports: Array<[string, Record<string, unknown>]>;
  examCounter: number;
  sessionCounter: number;
  inviteCounter: number;
  savedAt: string;
}

export interface MutableDemoState {
  exams: Map<string, ExamDraft>;
  examSessions: Map<string, ExamSession>;
  invites: DiagnosticInvite[];
  diagSessions: Map<string, DiagSessionState>;
  diagReports: Map<string, Record<string, unknown>>;
  examCounter: number;
  sessionCounter: number;
  inviteCounter: number;
}

export function serializeDemoState(state: MutableDemoState): DemoStateSnapshot {
  return {
    exams: Array.from(state.exams.values()),
    examSessions: Array.from(state.examSessions.values()),
    invites: state.invites,
    diagSessions: Array.from(state.diagSessions.entries()),
    diagReports: Array.from(state.diagReports.entries()),
    examCounter: state.examCounter,
    sessionCounter: state.sessionCounter,
    inviteCounter: state.inviteCounter,
    savedAt: new Date().toISOString(),
  };
}

export function applyDemoStateSnapshot(state: MutableDemoState, snapshot: DemoStateSnapshot) {
  for (const exam of snapshot.exams) {
    state.exams.set(exam.exam_id, exam);
  }
  for (const session of snapshot.examSessions) {
    state.examSessions.set(session.session_id, session);
  }
  if (snapshot.invites?.length) {
    const byId = new Map(snapshot.invites.map((i) => [i.id, i]));
    state.invites = [
      ...state.invites.filter((i) => !byId.has(i.id)),
      ...snapshot.invites,
    ];
  }
  for (const [id, sess] of snapshot.diagSessions ?? []) {
    state.diagSessions.set(id, sess);
  }
  for (const [id, report] of snapshot.diagReports ?? []) {
    state.diagReports.set(id, report);
  }
  state.examCounter = Math.max(state.examCounter, snapshot.examCounter ?? 0);
  state.sessionCounter = Math.max(state.sessionCounter, snapshot.sessionCounter ?? 0);
  state.inviteCounter = Math.max(state.inviteCounter, snapshot.inviteCounter ?? 0);
}

function readJsonFile(filePath: string): DemoStateSnapshot | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw) as DemoStateSnapshot;
  } catch {
    return null;
  }
}

function writeJsonFile(filePath: string, snapshot: DemoStateSnapshot) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf8");
  } catch {
    // read-only fs on some hosts
  }
}

function upstashConfigured(): boolean {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

async function loadFromUpstash(): Promise<DemoStateSnapshot | null> {
  if (!upstashConfigured()) return null;
  try {
    const url = `${process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "")}/get/${KV_KEY}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string | null };
    if (!data.result) return null;
    return JSON.parse(data.result) as DemoStateSnapshot;
  } catch {
    return null;
  }
}

async function saveToUpstash(snapshot: DemoStateSnapshot): Promise<void> {
  if (!upstashConfigured()) return;
  try {
    const url = `${process.env.UPSTASH_REDIS_REST_URL!.replace(/\/$/, "")}/set/${KV_KEY}`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(snapshot),
      cache: "no-store",
    });
  } catch {
    // optional backend
  }
}

export function loadDemoStateFromDisk(): DemoStateSnapshot | null {
  return readJsonFile(TMP_FILE) ?? readJsonFile(RUNTIME_FILE);
}

let syncPromise: Promise<void> | null = null;

export async function syncDemoStateFromStore(state: MutableDemoState): Promise<void> {
  if (syncPromise) return syncPromise;

  syncPromise = (async () => {
    const fromKv = await loadFromUpstash();
    const snapshot = fromKv ?? loadDemoStateFromDisk();
    if (snapshot) {
      applyDemoStateSnapshot(state, snapshot);
    }
    syncPromise = null;
  })();

  return syncPromise;
}

export async function persistDemoState(state: MutableDemoState): Promise<void> {
  const snapshot = serializeDemoState(state);
  writeJsonFile(process.env.VERCEL ? TMP_FILE : RUNTIME_FILE, snapshot);
  await saveToUpstash(snapshot);
}
