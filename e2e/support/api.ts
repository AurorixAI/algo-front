/**
 * A tiny client of the auth-service API, used to PREPARE data (orgs, staff, groups, lessons ...) quickly,
 * so that a UI test spends its clicks on what it is about, not on set-up. Assertions about behaviour are
 * made through the real UI; the API is only used to arrange the state and, sometimes, to check the result.
 *
 * Credentials: every organisation of a run gets random e-mails and random passwords that live in memory
 * only. The stack is thrown away after the run; nothing here is a real account and nothing is logged.
 */
import { randomBytes } from "node:crypto";
import type { Cookie } from "@playwright/test";
import { AUTH_API, AUTH_ORIGIN } from "./env";
import { businessNow, hhmm } from "./time";

export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    public detail: unknown,
  ) {
    super(`${status} ${path}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
    this.name = "ApiError";
  }
}

export interface Session {
  api: Api;
  userId: string;
  email: string;
  fullName: string;
  /** Cookies to hand to a browser context (`context.addCookies`). */
  cookies: Cookie[];
}

/** `Set-Cookie` headers of an auth response -> Playwright cookies of the `localhost` host. */
function toCookies(setCookies: string[]): Cookie[] {
  const out: Cookie[] = [];
  for (const raw of setCookies) {
    const [pair, ...attrs] = raw.split(";").map((s) => s.trim());
    const eq = pair.indexOf("=");
    if (eq < 1) continue;
    const cookie: Cookie = {
      name: pair.slice(0, eq),
      value: pair.slice(eq + 1),
      domain: "localhost",
      path: "/",
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: "Lax",
    };
    for (const attr of attrs) {
      const [k, v = ""] = attr.split("=");
      const key = k.toLowerCase();
      if (key === "path") cookie.path = v;
      else if (key === "httponly") cookie.httpOnly = true;
      else if (key === "secure") cookie.secure = true;
      else if (key === "max-age") cookie.expires = Math.floor(Date.now() / 1000) + Number(v);
    }
    out.push(cookie);
  }
  return out;
}

/**
 * The auth-service counts sign-in and invitation attempts per client address (30 sign-ins a minute), taking the
 * address from `X-Real-IP`, which in production is set by the reverse proxy in front of it (it overwrites
 * whatever a client sends). This harness has no proxy, so it plays that role: every API client of a run gets a
 * private address, i.e. its own bucket, and a suite that creates a dozen organisations in a few seconds - or two
 * runs in a row - does not run into the limit. The limiter itself is untouched.
 */
const randomClientIp = () => `10.${randomBytes(1)[0]}.${randomBytes(1)[0]}.${1 + (randomBytes(1)[0] % 250)}`;

export class Api {
  readonly clientIp = randomClientIp();
  constructor(public token?: string) {}

  async raw(method: string, path: string, opts: { query?: Record<string, unknown>; body?: unknown } = {}) {
    const url = new URL(`${AUTH_API}${path}`);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Real-IP": this.clientIp,
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
      },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* keep text */
    }
    if (!res.ok) throw new ApiError(res.status, `${method} ${path}`, data?.detail ?? data);
    return { data, res };
  }

  async get<T = any>(path: string, query?: Record<string, unknown>): Promise<T> {
    return (await this.raw("GET", path, { query })).data;
  }
  async post<T = any>(path: string, body?: unknown, query?: Record<string, unknown>): Promise<T> {
    return (await this.raw("POST", path, { body: body ?? {}, query })).data;
  }
  async put<T = any>(path: string, body?: unknown): Promise<T> {
    return (await this.raw("PUT", path, { body: body ?? {} })).data;
  }
  async patch<T = any>(path: string, body?: unknown): Promise<T> {
    return (await this.raw("PATCH", path, { body: body ?? {} })).data;
  }
  async del<T = any>(path: string): Promise<T> {
    return (await this.raw("DELETE", path)).data;
  }
}

function sessionFrom(data: any, res: Response, password?: string): Session {
  return {
    api: new Api(data.tokens.access_token),
    userId: data.user.id,
    email: data.user.email,
    fullName: data.user.full_name,
    cookies: toCookies(res.headers.getSetCookie()),
  };
}

const rand = (bytes = 5) => randomBytes(bytes).toString("hex");

/** Passwordless sign-in of the dev stack (`APP_ENV=development` mounts /auth/dev-login). */
export async function devLogin(role: "owner" | "admin" | "teacher"): Promise<Session> {
  const { data, res } = await new Api().raw("POST", "/auth/dev-login", { query: { role } });
  return sessionFrom(data, res);
}

export interface Staff extends Session {
  role: "admin" | "teacher";
  firstName: string;
  lastName: string;
}

export interface GroupInfo {
  id: string;
  name: string;
  teacherId: string | null;
}

export interface StudentInfo {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  displayId: string | null;
}

/** A throw-away organisation with its owner; the isolation unit of every spec file. */
export class Org {
  readonly staff: Staff[] = [];
  private seq = 0;

  private constructor(
    readonly name: string,
    readonly owner: Session,
    private readonly tag: string,
  ) {}

  static async create(label = "Центр"): Promise<Org> {
    const tag = rand(4);
    // The two first words give the centre's student-ID prefix ("QK-001"); the prefix must be unique between
    // centres, and the product allocates it without a lock (see `enrol`): random initials keep parallel
    // workers from asking for the same one.
    const initials = () => String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const name = `${initials()}${rand(1)} ${initials()}${rand(1)} ${label}`;
    const email = `owner-${tag}@e2e.algo.test`;
    const password = `Pw-${rand(12)}`;
    const api = new Api();
    await api.post("/auth/apply", {
      org_name: name,
      org_type: "tutoring_center",
      city: "Ташкент",
      phone: "+998901112233",
      email,
      password,
      first_name: "Олег",
      last_name: `Владельцев${tag}`,
    });
    const { data, res } = await api.raw("POST", "/auth/login", { body: { email, password } });
    return new Org(name, sessionFrom(data, res), tag);
  }

  /** Invite and register a teacher / an admin of this organisation. */
  async addStaff(role: "admin" | "teacher", lastName?: string): Promise<Staff> {
    const n = ++this.seq;
    const invite = await this.owner.api.post("/auth/org/invitations", { org_role: role });
    const firstName = role === "teacher" ? "Учитель" : "Админ";
    const last = lastName ?? `${role === "teacher" ? "Преподавателев" : "Администраторов"}${this.tag}${n}`;
    const email = `${role}-${this.tag}-${n}@e2e.algo.test`;
    const password = `Pw-${rand(12)}`;
    const { data, res } = await new Api().raw("POST", "/auth/invite/accept", {
      body: { code: invite.code, email, password, first_name: firstName, last_name: last },
    });
    const staff: Staff = { ...sessionFrom(data, res), role, firstName, lastName: last };
    this.staff.push(staff);
    return staff;
  }

  async createGroup(opts: {
    name: string;
    teacherId?: string;
    lessonType?: "group" | "mini_group" | "pair" | "individual";
    classLevel?: number;
    /** The group's capacity (1-100); the server's default (30) when omitted. */
    maxStudents?: number;
  }): Promise<GroupInfo> {
    const g = await this.owner.api.post("/auth/org/groups", {
      name: opts.name,
      class_level: opts.classLevel ?? 7,
      teacher_id: opts.teacherId,
      lesson_type: opts.lessonType ?? "group",
      max_students: opts.maxStudents,
    });
    return { id: g.id, name: g.name, teacherId: g.teacher_id ?? null };
  }

  async createStudent(firstName: string, lastName: string, classLevel = 7): Promise<StudentInfo> {
    const s = await this.owner.api.post("/auth/org/students", {
      first_name: firstName,
      last_name: lastName,
      class_level: classLevel,
      student_phone: `+99890${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`,
    });
    return { id: s.id, firstName, lastName, fullName: s.full_name, displayId: s.display_id ?? null };
  }

  /** Put a student into a group, optionally with a monthly fee (owner has the payments right). */
  async enrol(groupId: string, studentId: string, monthlyFee?: number): Promise<void> {
    // KNOWN PRODUCT RACE (reported with the E2E suite): the first enrolment of a centre picks its student-ID prefix
    // (initials of the name, +1/+2 when taken) without a cross-centre lock, so two centres enrolling their first
    // student in the same instant with equal initials get a 500 (unique violation on student_id_prefix). The
    // statement is rolled back, so asking again is safe and gets the next free prefix.
    for (let attempt = 0; ; attempt++) {
      try {
        await this.owner.api.post(
          `/auth/org/groups/${groupId}/students/${studentId}`,
          monthlyFee === undefined ? {} : { monthly_fee: monthlyFee },
        );
        return;
      } catch (e) {
        const race = e instanceof ApiError && e.status === 500 && /student_id_prefix/.test(JSON.stringify(e.detail));
        if (!race || attempt >= 3) throw e;
      }
    }
  }

  /** Create a student and put him into a group in one go. */
  async addStudent(group: GroupInfo, firstName: string, lastName: string, monthlyFee?: number): Promise<StudentInfo> {
    const s = await this.createStudent(firstName, lastName);
    await this.enrol(group.id, s.id, monthlyFee);
    // the public ID ("AB-001") is issued at enrolment, not when the student is created
    const fresh = await this.owner.api.get(`/auth/org/students/${s.id}`);
    return { ...s, displayId: fresh.display_id ?? null };
  }

  /** "Олег Владельцев…": the owner as the UI prints a person (first name, last name). */
  get ownerName(): string {
    return `Олег Владельцев${this.tag}`;
  }

  /** Membership (student x group) id of a student: the payments API works on memberships. */
  async membershipId(studentId: string, groupId?: string): Promise<string> {
    const rows: Array<{ membership_id: string; group_id: string }> = await this.owner.api.get(`/auth/org/students/${studentId}/memberships`);
    const row = groupId ? rows.find((r) => r.group_id === groupId) : rows[0];
    if (!row) throw new Error(`no membership of ${studentId}`);
    return row.membership_id;
  }

  /** Record a payment through the API (a calendar payment of the centre's default period unless `extra` says otherwise). */
  async pay(studentId: string, amount: number, extra: Record<string, unknown> = {}, groupId?: string) {
    const membership = await this.membershipId(studentId, groupId);
    return this.owner.api.post(`/auth/org/memberships/${membership}/payments`, {
      amount,
      paid_on: businessNow().date,
      ...extra,
    });
  }

  /** `PUT /org/settings/payments` (owner). */
  async setPaymentSettings(patch: Record<string, unknown>) {
    return this.owner.api.put("/auth/org/settings/payments", patch);
  }

  /**
   * A recurring lesson of the group on TODAY's weekday that has already started, for the business clock:
   * start = the current minute, end = start + 10. The API refuses a lesson that starts earlier than "now",
   * and refuses to START one before its time, so "this very minute" is the earliest valid shape. The
   * finish button opens `end - 15` min, i.e. at once. The lesson stays startable until midnight.
   */
  async createLessonStartingNow(groupId: string, actor: Session = this.owner, minutes = 10): Promise<LessonInfo> {
    for (let attempt = 0; attempt < 4; attempt++) {
      const now = await serverNow();
      if (now.minutes > 23 * 60 + 45) {
        throw new Error("Too close to midnight (Asia/Tashkent) for a same-day lesson: rerun the suite in a few minutes");
      }
      const start = now.minutes;
      const end = Math.min(start + minutes, 23 * 60 + 59);
      try {
        const lesson = await actor.api.post("/auth/org/schedule/lessons", {
          groupId,
          dayOfWeek: now.isoWeekday,
          startTime: hhmm(start),
          endTime: hhmm(end),
          topic: "E2E",
        });
        await clockReaches(start); // the server (and this machine) must have reached the lesson's minute: a start before it is refused
        return { id: lesson.id, groupId, date: now.date, startTime: hhmm(start), endTime: hhmm(end) };
      } catch (e) {
        if (!(e instanceof ApiError && /прошедшее время/.test(JSON.stringify(e.detail)))) throw e;
      }
    }
    throw new Error("could not create a lesson starting now");
  }
}

/** The business clock of the SERVER (its `Date` header; the container clock may differ from ours by a moment). */
export async function serverNow() {
  const header = await fetch(`${AUTH_ORIGIN}/health`).then((r) => r.headers.get("date")).catch(() => null);
  return businessNow(header ? new Date(header) : new Date());
}

/** Wait until server and local clocks both show at least `minutes` (since midnight, business time) - at most ~70 s. */
export async function clockReaches(minutes: number): Promise<void> {
  for (let i = 0; i < 280; i++) {
    const server = await serverNow();
    // 1.5 s cushion: the `Date` header is cached by the server for up to a second
    if (server.minutes >= minutes && businessNow(new Date(Date.now() - 1500)).minutes >= minutes) return;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`clock did not reach ${hhmm(minutes)}`);
}

/** Start a lesson (no marks yet), as `actor`. */
export async function startLesson(actor: Session, lesson: LessonInfo): Promise<void> {
  await actor.api.post(`/auth/org/groups/${lesson.groupId}/attendance/start`, { lessonDate: lesson.date, lessonId: lesson.id });
}

/** Journal marks the API accepts. */
export type Mark = "present" | "absent" | "excused" | "late";

/** Start a lesson and save its marks (and, optionally, complete it) through the API, as `actor`. */
export async function runLesson(
  actor: Session,
  lesson: LessonInfo,
  opts: {
    records: Record<string, Mark>;
    /** Reason per student marked "excused" (3..300 chars). */
    reasons?: Record<string, string>;
    complete?: boolean;
  },
): Promise<void> {
  const base = `/auth/org/groups/${lesson.groupId}/attendance`;
  await actor.api.post(`${base}/start`, { lessonDate: lesson.date, lessonId: lesson.id });
  await actor.api.post(base, {
    lessonDate: lesson.date,
    lessonId: lesson.id,
    status: opts.complete ? "completed" : "in_progress",
    records: opts.records,
    excuseReasons: opts.reasons,
  });
}

export interface LessonInfo {
  id: string;
  groupId: string;
  date: string;
  startTime: string;
  endTime: string;
}
