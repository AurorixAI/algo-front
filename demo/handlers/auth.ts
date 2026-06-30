import type { DemoRequest, DemoResponse } from "../types";
import orgFixture from "../fixtures/org.json";
import { demoState, initDemoState, generateDiagCode, nextInviteId } from "../engine/state";

const DEMO_COOKIE = "algo_demo_session";
const AUTH_COOKIE = "algo_auth_token";

function isDemoAuthenticated(cookies: Record<string, string>): boolean {
  return Boolean(cookies[DEMO_COOKIE] || cookies[AUTH_COOKIE]);
}

function cookieHeader(): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  const maxAge = "86400";
  const base = `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
  // Middleware expects algo_auth_token; demo session kept for /auth/me fallback
  return `${AUTH_COOKIE}=demo-access-token; ${base}, ${DEMO_COOKIE}=1; ${base}`;
}

function json(status: number, body: unknown, withAuthCookie = false, extraHeaders?: Record<string, string>): DemoResponse {
  return {
    status,
    body,
    headers: withAuthCookie
      ? { "Set-Cookie": cookieHeader(), ...extraHeaders }
      : extraHeaders,
  };
}

function authUser(role: "admin" | "teacher" = "admin") {
  const cfg = role === "teacher" ? orgFixture.teacher : orgFixture.admin;
  return {
    id: `user-demo-${role}`,
    email: cfg.email,
    first_name: cfg.first_name,
    last_name: cfg.last_name,
    full_name: `${cfg.last_name} ${cfg.first_name}`,
    role: cfg.role,
    default_org_id: orgFixture.org.id,
    org_role: cfg.org_role,
    org_name: orgFixture.org.name,
    language: "ru",
    is_active: true,
    is_verified: true,
    created_at: new Date().toISOString(),
  };
}

function authResponse(role: "admin" | "teacher" = "admin"): DemoResponse {
  const user = authUser(role);
  const tokens = {
    access_token: "demo-access-token",
    refresh_token: "demo-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
  };
  return json(200, {
    user,
    tokens,
    org: orgFixture.org,
  }, true);
}

export function handleAuth(req: DemoRequest): DemoResponse | null {
  initDemoState();
  const { method, path, body, cookies } = req;

  if (method === "POST" && path === "/auth/login") {
    const b = body as { email?: string; password?: string };
    const admin = orgFixture.admin;
    const teacher = orgFixture.teacher;
    if (b.email === admin.email && b.password === admin.password) return authResponse("admin");
    if (b.email === teacher.email && b.password === teacher.password) return authResponse("teacher");
    return json(401, { detail: "Неверный email или пароль" });
  }

  if (method === "POST" && path.startsWith("/auth/dev-login")) {
    const role = req.searchParams.get("role") || "admin";
    if (role === "teacher") return authResponse("teacher");
    return authResponse("admin");
  }

  if (method === "POST" && path === "/auth/refresh") {
    return json(200, { access_token: "demo-access-token", refresh_token: "demo-refresh-token" });
  }

  if (method === "GET" && path === "/auth/me") {
    if (!isDemoAuthenticated(cookies)) return json(401, { detail: "Not authenticated" });
    return json(200, authUser("admin"));
  }

  if (method === "POST" && path === "/auth/logout") {
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return json(200, { message: "ok" }, false, {
      "Set-Cookie": `${AUTH_COOKIE}=; Path=/; Max-Age=0${secure}, ${DEMO_COOKIE}=; Path=/; Max-Age=0${secure}`,
    });
  }

  // Public diagnostic invite
  if (method === "GET" && path.match(/^\/auth\/diagnostic\/[^/]+$/)) {
    const code = path.split("/").pop()!;
    const inv = demoState.invites.find((i) => i.code.toUpperCase() === code.toUpperCase());
    if (!inv) return json(404, { detail: "Диагностика не найдена" });
    return json(200, {
      id: inv.id,
      student_id: inv.student_id,
      student_first_name: inv.student_first_name,
      student_last_name: inv.student_last_name,
      class_level: inv.class_level,
      diagnostic_type: inv.diagnostic_type,
      status: inv.status,
      org_id: inv.org_id,
      org_name: inv.org_name,
      expires_at: inv.expires_at,
    });
  }

  if (method === "POST" && path.match(/^\/auth\/diagnostic\/[^/]+\/confirm$/)) {
    const code = path.split("/")[3];
    const inv = demoState.invites.find((i) => i.code.toUpperCase() === code.toUpperCase());
    if (!inv) return json(404, { detail: "Не найдено" });
    const b = body as { first_name?: string; last_name?: string };
    if (
      b.first_name?.toLowerCase() !== inv.student_first_name.toLowerCase() ||
      (b.last_name && b.last_name.toLowerCase() !== inv.student_last_name.toLowerCase())
    ) {
      return json(400, { detail: "Имя не совпадает" });
    }
    inv.status = "confirmed";
    return json(200, { id: inv.id, status: "confirmed", class_level: inv.class_level, student_id: inv.student_id, org_id: inv.org_id });
  }

  if (method === "POST" && path.match(/^\/auth\/diagnostic\/[^/]+\/start$/)) {
    const code = path.split("/")[3];
    const inv = demoState.invites.find((i) => i.code.toUpperCase() === code.toUpperCase());
    if (!inv) return json(404, { detail: "Не найдено" });
    inv.status = "in_progress";
    return json(200, { id: inv.id, status: "in_progress" });
  }

  // Org admin endpoints
  if (!isDemoAuthenticated(cookies) && !path.startsWith("/auth/diagnostic")) {
    if (path.startsWith("/auth/org")) return json(401, { detail: "Not authenticated" });
  }

  if (method === "GET" && path === "/auth/org/diagnostics") {
    return json(200, demoState.invites);
  }

  if (method === "POST" && path === "/auth/org/students") {
    const b = body as { first_name: string; last_name: string; class_level: number };
    const id = `stu-demo-${Date.now()}`;
    const student = {
      id,
      first_name: b.first_name,
      last_name: b.last_name,
      class_level: b.class_level,
      status: "new",
    };
    demoState.students.push(student);
    return json(201, { ...student, student_phone: "", comment: "" });
  }

  if (method === "POST" && path === "/auth/org/diagnostics") {
    const b = body as { student_id: string; class_level: number; diagnostic_type?: string };
    const student = demoState.students.find((s) => s.id === b.student_id);
    const code = generateDiagCode();
    const inv = {
      id: nextInviteId(),
      code,
      student_id: b.student_id,
      student_name: student ? `${student.first_name} ${student.last_name}` : "Ученик",
      student_first_name: student?.first_name ?? "Ученик",
      student_last_name: student?.last_name ?? "",
      class_level: b.class_level,
      diagnostic_type: b.diagnostic_type ?? "initial",
      status: "pending",
      org_id: orgFixture.org.id,
      org_name: orgFixture.org.name,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
      started_at: null,
      completed_at: null,
      result: null,
    };
    demoState.invites.unshift(inv);
    return json(201, {
      ...inv,
      url: `/d/${code}`,
    });
  }

  if (method === "GET" && path === "/auth/org/students") {
    return json(200, demoState.students);
  }

  return null;
}

export { DEMO_COOKIE };
