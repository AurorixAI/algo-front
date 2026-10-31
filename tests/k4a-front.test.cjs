// K4a «Поддержка», front side: the rules and the words of the form and of «Мои обращения» (lib/support.ts), the two entries of the cabinets (the profile menu of the rail
// and «Ещё» of the phone), the three pages, the section «Обращения» of the console.  The browser side (the form, 375 px, the double click, markup shown as text) is the
// Playwright run on the real stack (artifacts/k4/browser-check/k4a_e2e.cjs).
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
const root = path.join(__dirname, "..");
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {                              // the "@/" alias of the app, as in the other tests of the console
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const S = require(path.join(root, "src/lib/support.ts"));
const perms = require(path.join(root, "console/src/lib/permissions.ts"));
const labels = require(path.join(root, "console/src/lib/labels.ts"));
const queries = require(path.join(root, "console/src/lib/queries.ts"));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

// ---- the page and the errors carry no personal data (the SAME table is in auth tests/test_k4a_support_pg.py) --------------------------

test("[11] the template of a page: words stay, ids / numbers / codes / tokens become [id], no query, no fragment", () => {
  const cases = {
    "/teacher/students/6f1c2a3e-1111-4222-8333-944455556666": "/teacher/students/[id]",
    "/teacher/students/6f1c2a3e-1111-4222-8333-944455556666/": "/teacher/students/[id]",
    "/owner/groups/123": "/owner/groups/[id]",
    "/set-password/AbCdEf_-0123456789xyzTOKEN": "/set-password/[id]",
    "/set-password/onlylowercaseletterstoken": "/set-password/[id]",
    "/d/ABC123": "/d/[id]",
    "/d/abcdef": "/d/[id]",
    "/e/XyZ9": "/e/[id]",
    "/invite/abcdefghijklmnop": "/invite/[id]",
    "/confirm-email/tokentokentoken": "/confirm-email/[id]",
    "/diagnostic/AAAA1111": "/diagnostic/[id]",
    "/exams/by-code/abcdef": "/exams/by-code/[id]",
    "/api/v1/exams/by-code/abcdef/session-status/xyzxyz": "/api/v1/exams/by-code/[id]/session-status/[id]",
    "/owner/payments/thisisaverylongrunofletterstoken": "/owner/payments/[id]",
    "/owner/payments/abcdefghijklmnopqrstuvwx": "/owner/payments/abcdefghijklmnopqrstuvwx",
    "/owner/payments/abcdefghijklmnopqrstuvwxy": "/owner/payments/[id]",
    "/login?redirect=/owner/payments&token=SECRET#hash": "/login",
    "/owner/payments?student=6f1c2a3e": "/owner/payments",
    "https://app.algolab.me/admin/staff?x=1#y": "/admin/staff",
    "/owner/students/[id]": "/owner/students/[id]",
    "/teacher/Students/Иван": "/teacher/[id]/[id]",
    "": "",
    "/": "/",
  };
  for (const [raw, expected] of Object.entries(cases)) {
    const got = S.pageTemplate(raw);
    assert.equal(got, expected, raw);
    assert.doesNotMatch(got, /[?#=]/);
  }
  assert.equal(S.pageTemplate(null), "");
  assert.equal(S.pageTemplate(12), "");
  assert.equal(S.pageTemplate("/" + Array(20).fill("a").join("/")).split("/").length - 1, 8);   // a bounded path
});

test("[11] every token page and code page of the product masks its segment (ONE list, public-pages.ts)", () => {
  const PP = require(path.join(root, "src/lib/public-pages.ts"));
  for (const page of [...PP.TOKEN_PAGES, ...PP.CODE_PAGES]) assert.equal(S.pageTemplate(`${page}sometokenwithlowercaseonly`), `${page}[id]`, page);
  assert.match(read("src/lib/support.ts"), /from "\.\/public-pages"/);
});

test("[11] the ring of the last errors: 5 at most, status + method + the template of the route, nothing else", () => {
  S.resetClientErrors();
  for (let i = 0; i < 9; i += 1) S.recordClientError(500 + (i % 3), "get", `/auth/org/groups/${i}00/students?x=1`, new Date(Date.UTC(2026, 9, 31, 9, 30, i)));
  const got = S.recentClientErrors();
  assert.equal(got.length, 5);
  assert.deepEqual(Object.keys(got[0]).sort(), ["at", "method", "route_template", "status"]);
  assert.deepEqual(got.map((e) => e.route_template), Array(5).fill("/auth/org/groups/[id]/students"));
  assert.equal(got[0].method, "GET");
  assert.equal(got[4].at, "2026-10-31T09:30:08.000Z");
  S.resetClientErrors();
  S.recordClientError(409, "POST", "/auth/org/members/6f1c2a3e-1111-4222-8333-944455556666/archive");
  S.recordClientError(401, "POST", "/auth/support/tickets");                       // the support's own calls are not what the person writes about
  S.recordClientError(99, "GET", "/x");
  S.recordClientError(700, "GET", "/x");
  S.recordClientError(500, "TRACE", "/x");
  S.recordClientError(NaN, "GET", "/x");
  assert.deepEqual(S.recentClientErrors().map((e) => [e.status, e.method, e.route_template]), [[409, "POST", "/auth/org/members/[id]/archive"]]);
  S.recentClientErrors()[0].status = 1;                                              // a copy: the ring cannot be edited from outside
  assert.equal(S.recentClientErrors()[0].status, 409);
  S.resetClientErrors();
});

test("[11] the api layer records the failed calls with status, method and the ENDPOINT only (never the answer)", () => {
  const api = read("src/lib/api.ts");
  assert.equal((api.match(/recordClientError\(response\.status, method, endpoint\)/g) || []).length, 3, "the auth api, the exam api and the diagnostic api");
  assert.match(api, /import \{ recordClientError,/);
  const at = api.indexOf("recordClientError(response.status");
  const around = api.slice(at - 600, at + 200);
  assert.match(around, /throw new ApiError/);
  assert.doesNotMatch(api.slice(at, at + 80), /message|error\.detail/);
});

// ---- the form: the words and the rules ----------------------------------------------------------------------------------------------

test("the text: 10 to 2000 characters, counted without the spaces around", () => {
  assert.match(S.supportTextProblem(""), /минимум 10/);
  assert.match(S.supportTextProblem("   коротко  "), /минимум 10/);
  assert.equal(S.supportTextProblem("x".repeat(10)), null);
  assert.equal(S.supportTextProblem(" " + "x".repeat(2000) + " "), null);
  assert.match(S.supportTextProblem("x".repeat(2001)), /максимум 2000/);
});

test("the screenshots: at most 3, only pictures; a PNG within the limit goes as it is, anything else is drawn again, the long side is 1600", () => {
  assert.equal(S.screenshotProblem({ type: "image/png", size: 10 }, 0), null);
  assert.match(S.screenshotProblem({ type: "image/png", size: 10 }, 3), /не больше 3/);
  assert.match(S.screenshotProblem({ type: "application/pdf", size: 10 }, 0), /JPEG или PNG/);
  assert.match(S.screenshotProblem({ type: "", size: 10 }, 0), /JPEG или PNG/);
  assert.equal(S.screenshotProblem({ type: "image/heic", size: 10 }, 2), null);       // the browser may draw it; the server only ever sees JPEG / PNG
  assert.equal(S.sendAsIs({ type: "image/png", size: 500_000 }), true);
  assert.equal(S.sendAsIs({ type: "image/png", size: 2 * 1024 * 1024 }), false);
  assert.equal(S.sendAsIs({ type: "image/jpeg", size: 100 }), false);                 // a photo carries its place and time: always drawn again
  assert.equal(S.sendAsIs({ type: "image/heic", size: 100 }), false);
  assert.deepEqual(S.scaledSize(4000, 3000), { width: 1600, height: 1200 });
  assert.deepEqual(S.scaledSize(1200, 2400), { width: 800, height: 1600 });
  assert.deepEqual(S.scaledSize(800, 600), { width: 800, height: 600 });
  assert.ok(S.SUPPORT_TARGET_FILE_BYTES < S.SUPPORT_MAX_FILE_BYTES);
});

test("the words: the author's statuses, the success title, the empty state, the closed note", () => {
  assert.deepEqual(Object.values(S.SUPPORT_STATUS_WORDS), ["Отправлено", "В работе", "Нужен ваш ответ", "Решено"]);
  assert.equal(S.supportStatusWord("waiting"), "Нужен ваш ответ");
  assert.equal(S.supportSentTitle(17), "Обращение №17 принято");
  assert.equal(S.SUPPORT_SENT_NOTE, "Ответ придёт сюда — в «Мои обращения».");
  assert.equal(S.SUPPORT_EMPTY_TEXT, "Нажмите «Поддержка», если что-то не работает.");
  assert.equal(S.SUPPORT_LABEL, "Поддержка");
  assert.equal(S.supportFileLabel({ id: "x", content_type: "image/png", size: 120 * 1024, index: 2 }), "Снимок 2 · PNG · 120 КБ");
  assert.equal(S.supportFileLabel({ id: "x", content_type: "image/jpeg", size: 1.5 * 1024 * 1024, index: 1 }), "Снимок 1 · JPEG · 1,5 МБ");
  for (const text of [S.SUPPORT_FORM_HINT, S.SUPPORT_AUTO_NOTE, S.SUPPORT_CLOSED_NOTE, S.SUPPORT_EMPTY_TEXT]) assert.doesNotMatch(text, /\d{4}-\d{2}-\d{2}|snapshot|аудит|экземпляр|payload|HTTP|API/i);
});

test("the page of «Мои обращения» is the page of the cabinet the person is in", () => {
  assert.equal(S.supportPathOf("/owner/payments"), "/owner/support");
  assert.equal(S.supportPathOf("/admin/groups/12"), "/admin/support");
  assert.equal(S.supportPathOf("/teacher/exams"), "/teacher/support");
  assert.equal(S.supportPathOf(""), "/teacher/support");
  assert.equal(S.supportPathOf(null), "/teacher/support");
  assert.equal(S.supportPathOf("/other/x"), "/teacher/support");
});

test("a client key is a uuid and differs every time", () => {
  const keys = new Set(Array.from({ length: 20 }, () => S.newClientKey()));
  assert.equal(keys.size, 20);
  for (const key of keys) assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});

// ---- two entries (LESSONS 56: one fix in one place only is a defect), three pages, one window ------------------------------------

test("[14] «Поддержка» is in the profile menu of the rail AND in «Ещё» of the phone; the window is drawn once, by the sidebar", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.match(sidebar, /data-testid="profile-support"/);
  assert.match(sidebar, /showSupport\(\)/);
  assert.match(sidebar, /onSupport=\{DEMO_MODE \? undefined : showSupport\}/);
  assert.match(sidebar, /\{!DEMO_MODE && \(\s*<button[^>]*\s*type="button"\s*onClick=\{\(\) => \{ setProfileOpen\(false\); showSupport\(\); \}\}/);
  assert.equal((sidebar.match(/<SupportDialog \/>/g) || []).length, 1);
  assert.match(nav, /data-testid="more-support"/);
  assert.match(nav, /\{onSupport && \(/);
  assert.match(nav, /onSupport=\{onSupport\}/);
  for (const source of [sidebar, nav]) assert.match(source, /SUPPORT_LABEL/);
  assert.ok(sidebar.indexOf("profile-support") < sidebar.lastIndexOf("Выйти из системы"), "the row is above «Выйти»");
  assert.ok(nav.indexOf("more-support") < nav.lastIndexOf("Выйти из системы"), "the row is above «Выйти»");
  assert.doesNotMatch(sidebar + nav, /dangerouslySetInnerHTML/);
});

test("the three cabinets have the page «Мои обращения», all the same component", () => {
  for (const role of ["owner", "admin", "teacher"]) {
    const page = read(`src/app/${role}/support/page.tsx`);
    assert.match(page, /<SupportPage \/>/, role);
    assert.match(page, /from "@\/components\/support\/support-page"/);
  }
  assert.ok(exists("src/components/support/support-dialog.tsx"));
});

test("[10] what a person wrote is drawn as text: no raw HTML, no links made of it, in the cabinet and in the console", () => {
  for (const file of [...walk("src/components/support"), "console/src/components/support.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|innerHTML|insertAdjacentHTML|document\.write/, file);
    assert.doesNotMatch(source, /linkify|autolink|marked|markdown/i, file);
  }
  assert.match(read("src/components/support/support-page.tsx"), /whitespace-pre-wrap break-words/);
  assert.match(read("console/src/components/support.tsx"), /whitespace-pre-wrap break-words/);
});

test("[12] the form is sent once: a ref flag (not only the state), a key the server remembers, the success window in the style of the invitation", () => {
  const dialog = read("src/components/support/support-dialog.tsx");
  assert.match(dialog, /const inFlight = useRef\(false\)/);
  assert.match(dialog, /if \(inFlight\.current\) return;/);
  assert.match(dialog, /client_key: keyRef\.current/);
  assert.match(dialog, /keyRef\.current = newClientKey\(\)/);                    // a new key for a new window, the SAME key for a retry of this one
  assert.match(dialog, /busy=\{busy\}/);                                         // while sending Escape / the backdrop do not close it
  assert.match(dialog, /data-testid="support-sent"/);
  assert.match(dialog, /done\.current\?\.focus\(\)/);                            // «Готово» takes the focus, like InviteSentView
  assert.match(dialog, /text-lg font-semibold text-slate-900/);
  const invite = read("src/components/staff/invite-sent-view.tsx");
  assert.match(invite, /h-16 w-16 items-center justify-center rounded-full bg-emerald-50/);
  assert.match(dialog, /h-16 w-16 items-center justify-center rounded-full bg-emerald-50/);
  assert.match(dialog, /supportApi\.create\(\{ text: text\.trim\(\), client_key: keyRef\.current, page: pageTemplate\(pathname\), errors: recentClientErrors\(\) \}\)/);
  assert.doesNotMatch(dialog, /window\.location\.(href|search)/);                 // the address is never sent whole
});

test("the replies are sent once too, in the cabinet and in the console", () => {
  assert.match(read("src/components/support/support-page.tsx"), /const inFlight = useRef\(false\)/);
  const consoleScreen = read("console/src/components/support.tsx");
  assert.match(consoleScreen, /const replyFlag = useRef\(false\)/);
  assert.match(consoleScreen, /if \(!data \|\| replyFlag\.current\) return;/);
});

// ---- the console ---------------------------------------------------------------------------------------------------------------------

test("the console: the section «Обращения» is for support.manage only, after «Заявки»", () => {
  const nav = perms.NAV_ITEMS.map((i) => i.key);
  assert.deepEqual(nav, ["requests", "support", "centres", "users", "team", "roles", "audit"]);
  const staff = (permissions, owner = false) => ({ is_owner: owner, permissions });
  assert.deepEqual(perms.visibleNav(staff(["support.manage"])).map((i) => i.label), ["Обращения"]);
  assert.deepEqual(perms.visibleNav(staff(["requests.view", "orgs.view"])).map((i) => i.key), ["requests", "centres"]);
  assert.equal(perms.homePath(staff(["support.manage"])), "/support/");
  assert.equal(perms.activeNav("/support/"), "support");
  assert.deepEqual(perms.visibleNav(staff([], true)).map((i) => i.key), nav);
  assert.ok(exists("console/src/app/(panel)/support/page.tsx"));
  assert.match(read("console/src/components/shell.tsx"), /data-testid="new-support-badge"/);
});

test("the console: statuses, filters, mail marks", () => {
  assert.deepEqual(labels.SUPPORT_STATUSES.map((s) => s.label), ["Новое", "В работе", "Ждём ответа", "Решено"]);
  assert.deepEqual(labels.SETTABLE_SUPPORT_STATUSES.map((s) => s.value), ["in_progress", "waiting", "resolved"]);
  assert.deepEqual(labels.SUPPORT_ROLES.map((r) => r.label), ["Владелец", "Администратор", "Преподаватель"]);
  assert.equal(labels.supportStatus("zzz").label, "zzz");
  assert.deepEqual(labels.supportMailMark("failed", true), { text: "письмо автору не ушло", problem: true });
  assert.deepEqual(labels.supportMailMark("failed", false), { text: "письмо команде не ушло", problem: true });
  assert.equal(labels.supportMailMark("skipped", true).problem, true);
  assert.equal(labels.supportMailMark("pending", true).problem, false);
  assert.equal(labels.supportMailMark("sent", true), null);
  assert.equal(labels.supportMailMark(null, true), null);
  assert.ok(labels.TARGET_TYPES.some((t) => t.value === "support_ticket"));
  assert.deepEqual(queries.supportQuery({ ...queries.EMPTY_SUPPORT_FILTERS, q: " 12 ", status: "new", org: "Альфа", role: "teacher" }, 2, { key: "updated_at", order: "desc" }),
    { page: 2, page_size: 25, sort: "updated_at", order: "desc", q: "12", status: "new", org: "Альфа", role: "teacher" });
  assert.deepEqual(queries.supportQuery(queries.EMPTY_SUPPORT_FILTERS, 1, { key: "number", order: "asc" }),
    { page: 1, page_size: 25, sort: "number", order: "asc", q: undefined, status: undefined, org: undefined, role: undefined });
});

test("the console client: the paths and the address of a screenshot (same origin)", async () => {
  const { createConsoleApi } = require(path.join(root, "console/src/lib/api.ts"));
  const calls = [];
  const api = createConsoleApi({ baseUrl: "https://c.test/api/v1/platform", fetchImpl: async (url, init = {}) => { calls.push([String(url), init.method || "GET", init.body]); return new Response("{}", { status: 200, headers: { "Content-Type": "application/json" } }); } });
  await api.support.summary();
  await api.support.list({ page: 1, status: "new" });
  await api.support.get("t 1");
  await api.support.setStatus("t1", "resolved");
  await api.support.reply("t1", "Ответ");
  assert.deepEqual(calls.map((c) => [c[0].replace("https://c.test", ""), c[1]]), [
    ["/api/v1/platform/support/summary", "GET"], ["/api/v1/platform/support/tickets?page=1&status=new", "GET"], ["/api/v1/platform/support/tickets/t%201", "GET"],
    ["/api/v1/platform/support/tickets/t1/status", "PATCH"], ["/api/v1/platform/support/tickets/t1/messages", "POST"],
  ]);
  assert.deepEqual(JSON.parse(calls[3][2]), { status: "resolved" });
  assert.deepEqual(JSON.parse(calls[4][2]), { text: "Ответ" });
  assert.match(api.support.fileUrl("a b"), /\/api\/v1\/platform\/support\/attachments\/a%20b$/);
});

test("no technical word and no ISO date in the strings of the new screens", () => {
  const banned = /\b(snapshot|payload|endpoint|JSON|HTTP|uuid|token|exception)\b|\d{4}-\d{2}-\d{2}T?/i;
  for (const file of [...walk("src/components/support"), "console/src/components/support.tsx", "src/lib/support.ts"]) {
    const visible = read(file).split("\n").filter((line) => /[А-Яа-я]/.test(line) && /["'`>]/.test(line) && !line.trim().startsWith("//") && !line.trim().startsWith("*") && !line.trim().startsWith("/*"));
    for (const line of visible) {
      const strings = (line.match(/"[^"]*[А-Яа-я][^"]*"|'[^']*[А-Яа-я][^']*'|>[^<>{}]*[А-Яа-я][^<>{}]*</g) || []);
      for (const text of strings) assert.doesNotMatch(text, banned, `${file}: ${text}`);
    }
  }
});
