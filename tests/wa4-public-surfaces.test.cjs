// Wave A / A4 (front): CSV with formulas (F-A16), the demo API and cookie only in a demo build (F-A02),
// the middleware gate (F-A04), one path/query encoding in api.ts (SEC-3), the invite code of the report in a header (S-02).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) },
  }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const root = path.join(__dirname, "..");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@demo/")) request = path.join(root, "demo", request.slice(6));
  else if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const { NextRequest } = require("next/server");
const load = (rel) => { const f = path.join(root, rel); delete require.cache[f]; return require(f); };

// ---- F-A16: the CSV of the exam results -----------------------------------------------------

const C = require(path.join(root, "src/lib/csv.ts"));
const E = require(path.join(root, "src/lib/exam-sessions-csv.ts"));

/** A strict RFC 4180 reader: what a spreadsheet makes of the file. */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false, i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i += 2; continue; }
      if (ch === '"') { quoted = false; i += 1; continue; }
      cell += ch; i += 1; continue;
    }
    if (ch === '"' && cell === "") { quoted = true; i += 1; continue; }
    if (ch === ",") { row.push(cell); cell = ""; i += 1; continue; }
    if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 2; continue; }
    cell += ch; i += 1;
  }
  assert.equal(quoted, false, "a quote was left open");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const session = (over = {}) => ({
  student_name: "Алия Каримова", variant_number: 2, score: 7, max_score: 10, correct_count: 7, total_tasks: 10,
  percentage: 70, time_spent_seconds: 605, status: "submitted", submitted_at: "2026-10-20T08:30:00", ...over,
});

test("a name that starts with = + - @ tab or CR gets the apostrophe: no formula reaches Excel", () => {
  for (const name of ['=HYPERLINK("http://evil","x")', "=1+1", "+7 999", "-2+3", "@SUM(A1)", "\t=1", "\r=1"]) {
    const cell = parseCsv(E.buildExamSessionsCsv([session({ student_name: name })]))[1][0];
    assert.equal(cell, "'" + name, JSON.stringify(name));
    assert.ok(!/^[=+\-@\t\r]/.test(cell));
  }
});

test("a comma, a quote or a line break in the name keeps the row at ten columns (RFC 4180)", () => {
  for (const name of ["Каримова, Алия", 'Алия "Али" К.', "Алия\nК.", "Алия\r\nК.", '"", ,', "=A,B"]) {
    const rows = parseCsv(E.buildExamSessionsCsv([session({ student_name: name }), session()]));
    assert.equal(rows.length, 3, JSON.stringify(name));
    for (const r of rows) assert.equal(r.length, 10, JSON.stringify(name));
    assert.equal(rows[1][0], name.startsWith("=") ? "'" + name : name);
  }
});

test("an ordinary row is not touched; numbers stay numbers; the status is in Russian; CRLF lines", () => {
  const csv = E.buildExamSessionsCsv([session(), session({ status: "in_progress", submitted_at: null, student_name: "Бобур" })]);
  const rows = parseCsv(csv);
  assert.deepEqual(rows[0], ["Студент", "Вариант", "Балл", "Макс", "Правильных", "Всего", "Процент", "Время", "Статус", "Сдано"]);
  assert.deepEqual(rows[1], ["Алия Каримова", "2", "7", "10", "7", "10", "70.0", "10:05", "Сдал", "20.10.2026 13:30"]);
  assert.deepEqual(rows[2].slice(8), ["Проходит", "—"]);
  assert.ok(csv.endsWith("\r\n") && !/[^\r]\n/.test(csv), "every line ends with CRLF");
  assert.ok(!csv.includes("submitted") && !csv.includes("in_progress"));
  // a negative NUMBER is a number (not text): no apostrophe
  assert.equal(C.csvCell(-3), "-3");
  assert.equal(C.csvCell("-3"), "'-3");
  assert.equal(C.csvCell(null), "");
});

test("the import report (CSV of the skipped students, names from the teacher's sheet) is guarded too", () => {
  const R = load("src/lib/import-report.ts");
  const csv = R.importReportCsv([{ sheet: "Ученики", row: 9, code: "X", message: "Причина", student: '=HYPERLINK("http://e")', group: "-1" }]);
  assert.equal(csv.split("\r\n")[1], `Ученики;9;"'=HYPERLINK(""http://e"")";'-1;Причина`);
});

test("the export button builds the file through the guarded builder", () => {
  const page = fs.readFileSync(path.join(root, "src/app/teacher/exams/[id]/sessions/page.tsx"), "utf8");
  assert.match(page, /buildExamSessionsCsv\(sessions\)/);
  assert.doesNotMatch(page, /\.join\(","\)/);
});

// ---- F-A02: the demo API ----------------------------------------------------------------------

const withEnv = async (value, fn) => {
  const before = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (value === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE; else process.env.NEXT_PUBLIC_DEMO_MODE = value;
  try { return await fn(); } finally {
    if (before === undefined) delete process.env.NEXT_PUBLIC_DEMO_MODE; else process.env.NEXT_PUBLIC_DEMO_MODE = before;
  }
};
const ctx = (...p) => ({ params: { path: p } });
const demoReq = (method, url, init = {}) => new NextRequest(`https://algo.example${url}`, { method, ...init });

test("DEMO_MODE off (unset, false, anything but true): every method of the demo route is 404, no cookie, nothing written", async () => {
  const route = load("src/app/api/demo/v1/[...path]/route.ts");
  for (const value of [undefined, "false", "", "1", "TRUE"]) {
    await withEnv(value, async () => {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
        const body = method === "GET" ? undefined : JSON.stringify({ email: "x", password: "y" });
        const res = await route[method](demoReq(method, "/api/demo/v1/auth/login", { body }), ctx("auth", "login"));
        assert.equal(res.status, 404, `${method} ${value}`);
        assert.equal(res.headers.get("set-cookie"), null, `${method} ${value}`);
      }
      const dev = await route.POST(demoReq("POST", "/api/demo/v1/auth/dev-login?role=admin"), ctx("auth", "dev-login"));
      assert.equal(dev.status, 404);
      assert.equal(dev.headers.get("set-cookie"), null);
    });
  }
});

test("DEMO_MODE on: the route works, the cookie is the demo one and never algo_auth_token", async () => {
  const route = load("src/app/api/demo/v1/[...path]/route.ts");
  await withEnv("true", async () => {
    const anon = await route.GET(demoReq("GET", "/api/demo/v1/auth/me"), ctx("auth", "me"));
    assert.equal(anon.status, 401);
    const me = await route.GET(demoReq("GET", "/api/demo/v1/auth/me", { headers: { cookie: "algo_demo_session=1" } }), ctx("auth", "me"));
    assert.equal(me.status, 200);
    // the REAL session cookie does not authenticate the demo API (and the demo cookie is not the real one)
    const real = await route.GET(demoReq("GET", "/api/demo/v1/auth/me", { headers: { cookie: "algo_auth_token=real-jwt" } }), ctx("auth", "me"));
    assert.equal(real.status, 401);
  });
  const { handleAuth } = load("demo/handlers/auth.ts");
  const login = handleAuth({ method: "POST", path: "/auth/dev-login", searchParams: new URLSearchParams("role=admin"), body: {}, cookies: {} });
  const setCookie = login.headers["Set-Cookie"];
  assert.match(setCookie, /^algo_demo_session=1;/);
  assert.doesNotMatch(setCookie, /algo_auth_token/);
  const logout = handleAuth({ method: "POST", path: "/auth/logout", searchParams: new URLSearchParams(), body: {}, cookies: {} });
  assert.doesNotMatch(logout.headers["Set-Cookie"], /algo_auth_token/, "a demo logout must not erase a real session cookie");
});

// ---- F-A04: the middleware gate ------------------------------------------------------------------

const visit = (url, cookie) => load("src/middleware.ts").middleware(new NextRequest(`https://algo.example${url}`, cookie ? { headers: { cookie } } : undefined));
const redirectsToLogin = (res) => res.status === 307 && new URL(res.headers.get("location")).pathname === "/login";

test("the demo cookie opens the gate only in a demo build; the real cookie always", async () => {
  await withEnv(undefined, async () => {
    assert.ok(redirectsToLogin(visit("/owner/groups", "algo_demo_session=1")), "a hand-made demo cookie on a real deployment");
    assert.equal(visit("/owner/groups", "algo_auth_token=jwt").status, 200);
  });
  await withEnv("true", async () => {
    assert.equal(visit("/owner/groups", "algo_demo_session=1").status, 200);
    assert.ok(redirectsToLogin(visit("/owner/groups")));
  });
});

test("only real static files skip the gate: a dot in an id of a protected page does not", async () => {
  await withEnv(undefined, async () => {
    for (const url of ["/owner/payments/receipt/a.b", "/teacher/groups/x.y", "/owner/files/report.pdf", "/teacher/exams/1.2/draft"]) {
      assert.ok(redirectsToLogin(visit(url)), url);
    }
    for (const url of ["/favicon.ico", "/robots.txt", "/logo.PNG", "/fonts/a.woff2", "/_next/static/a.js", "/api/v1/x", "/api/demo/v1/auth/me"]) {
      assert.equal(visit(url).status, 200, url);
    }
    // /forgot-password has no page: it is no longer announced as public
    assert.ok(redirectsToLogin(visit("/forgot-password")));
    for (const url of ["/", "/login", "/register", "/e/ABC123", "/d/ABC123", "/invite/X", "/diagnostic/Y"]) assert.equal(visit(url).status, 200, url);
  });
});

// ---- SEC-3 / S-02: what api.ts puts into the URL ------------------------------------------------------

function captureFetch() {
  const calls = [];
  global.window = { location: { pathname: "/owner", search: "", href: "" } };
  global.localStorage = { removeItem() {}, getItem: () => null, setItem() {} };
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", headers: init.headers || {} });
    return { ok: true, status: 200, json: async () => ({}), text: async () => "{}", blob: async () => ({}) };
  };
  return calls;
}
const loadApi = () => load("src/lib/api.ts");

test("an id taken from the address bar stays ONE path segment (no ../ walk through the auth API)", async () => {
  const calls = captureFetch();
  const { orgApi, examsApi } = loadApi();
  for (const evil of ["..%2f..%2fx", "../../x", "a/b?x=1#h", "a%2Fb"]) {
    calls.length = 0;
    await orgApi.removeMember(evil);
    await orgApi.getStudent(evil);
    await orgApi.getGroup(evil);
    await examsApi.getSummary(evil);
    for (const c of calls) {
      const u = new URL(c.url);
      assert.ok(!u.pathname.includes("/../") && !/\/\.\.(\/|$)/.test(u.pathname), `${evil} -> ${c.url}`);
      assert.equal(u.search, "", `${evil} -> ${c.url}`);
      assert.equal(u.hash, "");
      // the last segment is the whole id, encoded once
      assert.equal(u.pathname.split("/").length, c.url.includes("/exams/") ? 5 : 7, `${evil} -> ${c.url}`);
    }
  }
  calls.length = 0;
  await orgApi.removeMember("11111111-2222-3333-4444-555555555555");
  assert.match(calls[0].url, /\/auth\/org\/members\/11111111-2222-3333-4444-555555555555$/);
});

test("query values are encoded: a role / status / teacher id cannot add parameters", async () => {
  const calls = captureFetch();
  const { orgApi } = loadApi();
  await orgApi.updateMemberRole("m1", "admin&x=1");
  await orgApi.listMembers("all&evil=1");
  assert.equal(new URL(calls[0].url).searchParams.get("role"), "admin&x=1");
  assert.deepEqual([...new URL(calls[0].url).searchParams.keys()], ["role"]);
  assert.deepEqual([...new URL(calls[1].url).searchParams.keys()], ["status"]);
});

test("no raw ${id} left in an API path or query of api.ts (the guard the audit asked for)", () => {
  const src = fs.readFileSync(path.join(root, "src/lib/api.ts"), "utf8").split("\n");
  const bad = [];
  src.forEach((line, i) => {
    for (const m of line.matchAll(/(?:\/|[?&]\w+=)\$\{([A-Za-z_.]+)\}/g)) {
      // numbers / booleans / prebuilt query strings are not user text
      if (/^(variantNumber|force|permanent|includeVoided|hours|days|AUTH_API_V1|EXAM_API_V1|DIAG_API_V1|ORIGIN)$/.test(m[1])) continue;
      bad.push(`${i + 1}: ${m[0]}`);
    }
  });
  assert.deepEqual(bad, []);
});

test("the invite code of the report travels in a header, never in the URL", async () => {
  const calls = captureFetch();
  const { diagnosticApi } = loadApi();
  await diagnosticApi.getReport("sess-1", "ABCD-1234");
  const c = calls[0];
  assert.equal(new URL(c.url).search, "");
  assert.equal(new URL(c.url).pathname.endsWith("/diagnostic/sessions/sess-1/report"), true);
  assert.equal(c.headers["X-Diagnostic-Invite-Code"], "ABCD-1234");
  assert.ok(!c.url.includes("ABCD-1234"));
});
