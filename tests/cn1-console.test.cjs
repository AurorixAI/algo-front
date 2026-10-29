// Console-1 (front), part 2: the ALGO console (console/): the one API client, route guards, permissions, forms,
// queries, and the rules of a static export that shares the platform's UI kit.
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
const replaced = [];
// `next/navigation` needs the App Router at runtime; a server render of the panel only needs the shape.
const navigation = { useRouter: () => ({ replace: (to) => replaced.push(to), push: (to) => replaced.push(to) }), usePathname: () => "/requests/" };
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "next/navigation") return navigation;
  return load.call(this, request, ...rest);
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
// ONE copy of the HTTP client: `instanceof HttpError` must hold across the modules below.
const H = require(path.join(root, "src/lib/http-json.ts"));
const C = (name) => require(path.join(root, "console/src/lib", name));
const { createConsoleApi } = C("api.ts");
const guard = C("guard.ts");
const perms = C("permissions.ts");
const forms = C("forms.ts");
const queries = C("queries.ts");
const labels = C("labels.ts");
const fmt = C("format.ts");

function recorder(reply) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined, credentials: init.credentials };
    calls.push(call);
    return reply(call);
  };
  return { calls, fetchImpl };
}
const json = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const ME = (over = {}) => ({
  user: { id: "u1", email: "o@algolab.me", first_name: "Арслан", last_name: "Д.", name: "Арслан Д." }, role: { id: "r1", name: "Владелец платформы" },
  is_owner: true, permissions: [], must_change_password: false, totp_enabled: false, session: { expires_at: "2026-10-26T01:00:00Z" }, ...over,
});

// ---- the one API client ----------------------------------------------------------------------------------------

test("every endpoint of API_CONTRACT v1: method, path, body", async () => {
  const { calls, fetchImpl } = recorder(() => json(200, {}));
  const api = createConsoleApi({ fetchImpl });
  const id = "11111111-2222-3333-4444-555555555555";
  await api.auth.login("a@b.uz", "pw");
  await api.auth.logout();
  await api.auth.logoutAll();
  await api.auth.me();
  await api.auth.changePassword("old", "new");
  await api.permissions();
  await api.requests.list({ status: "new", page: 2 });
  await api.requests.get(id);
  await api.requests.setStatus(id, "contacted");
  await api.requests.addNote(id, "позвонили");
  await api.requests.approve(id, { org_name: "Х" });
  await api.requests.approve(id);
  await api.requests.decline(id, "вне региона", true);
  await api.orgs.list({ q: "альфа" });
  await api.orgs.get(id);
  await api.orgs.block(id, "неоплата");
  await api.orgs.unblock(id);
  await api.orgs.unblock(id, "оплатили");
  await api.orgs.setLimits(id, { max_students: 300 });
  await api.users.list({ q: "ivan" });
  await api.users.get(id);
  await api.users.resendInvite(id);
  await api.users.sendReset(id);
  await api.users.block(id, "взлом");
  await api.users.unblock(id);
  await api.roles.list();
  await api.roles.create("Продажи 2", ["requests.view"]);
  await api.roles.update(id, { name: "Н" });
  await api.roles.remove(id);
  await api.staff.list();
  await api.staff.create({ email: "s@algolab.me", first_name: "С", last_name: "С", role_id: id, password: "x".repeat(12) });
  await api.staff.update(id, { is_active: false });
  await api.staff.resetPassword(id, "y".repeat(12));
  await api.audit.list({ action: "org.blocked,org.unblocked", date_from: "2026-10-01" });
  await api.audit.actions();

  const P = "/api/v1/platform";
  const got = calls.map((c) => `${c.method} ${c.url.replace(P, "")}${c.body === undefined ? "" : " " + JSON.stringify(c.body)}`);
  assert.deepEqual(got, [
    'POST /auth/login {"email":"a@b.uz","password":"pw"}',
    "POST /auth/logout",
    "POST /auth/logout-all",
    "GET /auth/me",
    'POST /auth/change-password {"current_password":"old","new_password":"new"}',
    "GET /permissions",
    "GET /demo-requests?status=new&page=2",
    `GET /demo-requests/${id}`,
    `PATCH /demo-requests/${id}/status {"status":"contacted"}`,
    `POST /demo-requests/${id}/notes {"text":"позвонили"}`,
    `POST /demo-requests/${id}/approve {"org_name":"Х"}`,
    `POST /demo-requests/${id}/approve {}`,
    `POST /demo-requests/${id}/decline {"reason":"вне региона","send_email":true}`,
    `GET /orgs?q=${encodeURIComponent("альфа")}`,
    `GET /orgs/${id}`,
    `POST /orgs/${id}/block {"reason":"неоплата"}`,
    `POST /orgs/${id}/unblock {}`,
    `POST /orgs/${id}/unblock {"reason":"оплатили"}`,
    `PATCH /orgs/${id}/limits {"max_students":300}`,
    "GET /users?q=ivan",
    `GET /users/${id}`,
    `POST /users/${id}/resend-invite {}`,
    `POST /users/${id}/send-reset {}`,
    `POST /users/${id}/block {"reason":"взлом"}`,
    `POST /users/${id}/unblock {}`,
    "GET /roles",
    'POST /roles {"name":"Продажи 2","permissions":["requests.view"]}',
    `PATCH /roles/${id} {"name":"Н"}`,
    `DELETE /roles/${id}`,
    "GET /staff",
    `POST /staff {"email":"s@algolab.me","first_name":"С","last_name":"С","role_id":"${id}","password":"xxxxxxxxxxxx"}`,
    `PATCH /staff/${id} {"is_active":false}`,
    `POST /staff/${id}/reset-password {"password":"yyyyyyyyyyyy"}`,
    `GET /audit?action=${encodeURIComponent("org.blocked,org.unblocked")}&date_from=2026-10-01`,
    "GET /audit/actions",
  ]);
  for (const call of calls) {
    assert.equal(call.credentials, "include", call.url);
    assert.equal(call.headers.Authorization, undefined, "the console never sends a token of its own: the session is the HttpOnly cookie");
    assert.ok(call.url.startsWith(P + "/"), call.url);
  }
});

test("an id from the address bar is ONE path segment", async () => {
  const { calls, fetchImpl } = recorder(() => json(404, { detail: "Не найдено", code: "not_found" }));
  const api = createConsoleApi({ fetchImpl });
  for (const evil of ["../../auth/logout-all", "a/b?x=1#h", "a%2Fb"]) {
    await api.requests.get(evil).catch(() => {});
    await api.orgs.block(evil, "причина").catch(() => {});
  }
  for (const call of calls) assert.match(call.url, /^\/api\/v1\/platform\/(demo-requests|orgs)\/[^/?#]+(\/block)?$/, call.url);
});

test("errors keep the server's Russian text and code; a 422 carries per-field messages; a 429 its wait", async () => {
  const api = createConsoleApi({ fetchImpl: recorder((c) => {
    if (c.url.endsWith("/approve")) return json(409, { detail: "Пользователь с такой почтой уже есть в ALGO. Укажите другую почту владельца.", code: "email_in_use" });
    if (c.url.endsWith("/staff")) return json(422, { detail: "Проверьте поля", code: "validation_error", fields: { password: "Пароль не короче 12 символов" } });
    return json(429, { detail: "Слишком много попыток входа. Повторите через 15 минут.", code: "login_locked", retry_after: 900 }, { "Retry-After": "900" });
  }).fetchImpl });
  const conflict = await api.requests.approve("x").catch((e) => e);
  assert.equal(conflict.status, 409);
  assert.equal(conflict.code, "email_in_use");
  assert.match(conflict.message, /Укажите другую почту владельца/);
  const invalid = await api.staff.create({ email: "a@b.uz", first_name: "a", last_name: "b", role_id: "r", password: "short" }).catch((e) => e);
  assert.deepEqual(invalid.fields, { password: "Пароль не короче 12 символов" });
  const locked = await api.auth.login("a@b.uz", "bad").catch((e) => e);
  assert.equal(locked.status, 429);
  assert.equal(locked.retryAfter, 900);
  assert.equal(locked.code, "login_locked");
});

test("session hooks: a 401 of a panel call and a forced password change are reported; the sign-in and the session check answer for themselves", async () => {
  const events = [];
  const hooks = { unauthorized: () => events.push("401"), mustChangePassword: () => events.push("must-change") };
  const { fetchImpl } = recorder((c) => {
    if (c.url.endsWith("/demo-requests")) return json(401, { detail: "Сессия закончилась", code: "session_expired" });
    if (c.url.endsWith("/orgs")) return json(403, { detail: "Сначала смените пароль", code: "must_change_password" });
    return json(401, { detail: "Неверная почта или пароль", code: "invalid_credentials" });
  });
  const api = createConsoleApi({ fetchImpl }, hooks);
  await api.requests.list({}).catch(() => {});
  await api.orgs.list({}).catch(() => {});
  await api.auth.login("a@b.uz", "bad").catch(() => {});
  await api.auth.me().catch(() => {});
  assert.deepEqual(events, ["401", "must-change"]);
});

// ---- route guards: no session -> sign-in (through the API's 401) -------------------------------------------------

test("without a session every panel page ends at the sign-in: /auth/me answers 401 -> redirect", async () => {
  const api = createConsoleApi({ fetchImpl: recorder(() => json(401, { detail: "Войдите в консоль", code: "not_authenticated" })).fetchImpl });
  const check = await api.auth.me().then((me) => ({ me }), (error) => ({ error }));
  assert.deepEqual(guard.guardDecision(check, "panel"), { kind: "redirect", to: "/login/", reason: undefined });
  assert.deepEqual(guard.guardDecision(check, "change-password"), { kind: "redirect", to: "/login/", reason: undefined });
  assert.deepEqual(guard.guardDecision(check, "login"), { kind: "stay" });
});

test("guard matrix: expired session, not a staff member, forced password change, signed-in on the sign-in page, lost connection", () => {
  const err = (status, code) => ({ error: new H.HttpError({ status, message: "x", code }) });
  assert.deepEqual(guard.guardDecision(err(401, "session_expired"), "panel"), { kind: "redirect", to: "/login/", reason: "expired" });
  assert.deepEqual(guard.guardDecision(err(403, "not_staff"), "panel"), { kind: "redirect", to: "/login/", reason: "no_access" });
  assert.deepEqual(guard.guardDecision(err(403, "must_change_password"), "panel"), { kind: "redirect", to: "/change-password/" });
  assert.deepEqual(guard.guardDecision(err(403, "must_change_password"), "change-password"), { kind: "stay" });
  // a signed-in person
  const owner = ME();
  assert.deepEqual(guard.guardDecision({ me: owner }, "panel"), { kind: "allow", me: owner });
  assert.deepEqual(guard.guardDecision({ me: owner }, "login"), { kind: "redirect", to: "/requests/" });
  assert.deepEqual(guard.guardDecision({ me: owner }, "change-password"), { kind: "redirect", to: "/requests/" });
  const fresh = ME({ must_change_password: true });
  assert.deepEqual(guard.guardDecision({ me: fresh }, "panel"), { kind: "redirect", to: "/change-password/" });
  assert.deepEqual(guard.guardDecision({ me: fresh }, "login"), { kind: "redirect", to: "/change-password/" });
  assert.deepEqual(guard.guardDecision({ me: fresh }, "change-password"), { kind: "allow", me: fresh });
  // a lost connection is NOT a lost session: stay, offer a retry
  assert.equal(guard.guardDecision({ error: new H.HttpError({ status: 0, message: "Нет связи" }) }, "panel").kind, "error");
  assert.equal(guard.guardDecision(err(502), "panel").kind, "error");
  assert.equal(guard.guardDecision({ error: new Error("boom") }, "panel").kind, "error");
  assert.deepEqual(guard.guardDecision({ error: new Error("boom") }, "login"), { kind: "stay" });
  assert.match(guard.loginNotice("expired"), /Сессия закончилась/);
  assert.equal(guard.loginNotice("whatever"), null);
});

test("the panel holds back its content until the server has said who is signed in", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { PanelShell } = require(path.join(root, "console/src/components/shell.tsx"));
  const html = renderToStaticMarkup(React.createElement(PanelShell, null, React.createElement("p", null, "СЕКРЕТНАЯ ТАБЛИЦА")));
  assert.doesNotMatch(html, /СЕКРЕТНАЯ ТАБЛИЦА/);
  assert.match(html, /Проверяем вход/);
  const layout = read("console/src/app/(panel)/layout.tsx");
  assert.match(layout, /<PanelShell>/);
  assert.match(read("console/src/components/shell.tsx"), /<SessionGate page="panel">/);
  assert.match(read("console/src/app/change-password/page.tsx"), /<SessionGate page="change-password">/);
  // the sign-in page checks an existing session and redirects away from itself
  assert.match(read("console/src/app/login/page.tsx"), /guardDecision\(check, "login"\)/);
});

// ---- permissions and the sidebar -------------------------------------------------------------------------------

test("permissions: the owner has everything; a role sees only its sections; nobody sees «Команда» and «Роли» without team.manage", () => {
  const owner = ME({ permissions: [] });
  assert.deepEqual(perms.visibleNav(owner).map((i) => i.label), ["Заявки", "Центры", "Пользователи", "Команда", "Роли", "Журнал"]);
  const sales = ME({ is_owner: false, permissions: ["requests.view", "requests.manage", "orgs.view"] });
  assert.deepEqual(perms.visibleNav(sales).map((i) => i.key), ["requests", "centres"]);
  assert.equal(perms.can(sales, "requests.manage"), true);
  assert.equal(perms.can(sales, "orgs.block"), false);
  assert.equal(perms.can(null, "requests.view"), false);
  const content = ME({ is_owner: false, permissions: ["content.view"] });
  assert.deepEqual(perms.visibleNav(content), []);
  assert.equal(perms.homePath(content), "/no-access/");
  assert.equal(perms.homePath(ME({ is_owner: false, permissions: ["users.view"] })), "/users/");
  assert.equal(perms.activeNav("/centres/"), "centres");
  assert.equal(perms.activeNav("/centres"), "centres");
  assert.equal(perms.activeNav("/no-access/"), null);
});

// ---- forms -----------------------------------------------------------------------------------------------------

test("sign-in and forced password change forms", () => {
  assert.deepEqual(forms.validateLogin({ email: "", password: "" }), { email: "Введите почту", password: "Введите пароль" });
  assert.ok(forms.validateLogin({ email: "abc", password: "x" }).email);
  assert.deepEqual(forms.validateLogin({ email: "a@b.uz", password: "x" }), {});
  const ok = { current: "temp-password-1", next: "a-brand-new-pass", confirm: "a-brand-new-pass" };
  assert.deepEqual(forms.validateNewPassword(ok), {});
  assert.ok(forms.validateNewPassword({ ...ok, next: "short", confirm: "short" }).next);
  assert.ok(forms.validateNewPassword({ ...ok, next: "elevenchars", confirm: "elevenchars" }).next, "11 < 12");
  assert.equal(forms.validateNewPassword({ ...ok, next: "twelve-chars", confirm: "twelve-chars" }).next, undefined, "exactly 12 is enough");
  assert.match(forms.validateNewPassword({ ...ok, next: ok.current, confirm: ok.current }).next, /отличаться/);
  assert.match(forms.validateNewPassword({ ...ok, confirm: "different-one-1" }).confirm, /не совпадают/);
  assert.ok(forms.validateNewPassword({ ...ok, current: "" }).current);
});

test("new staff member: name, e-mail, role, a password of at least 12 set by the owner", () => {
  const v = { firstName: "Мария", lastName: "Петрова", email: "m.petrova@algolab.me", roleId: "r1", password: "Temp-pass-2026" };
  assert.deepEqual(forms.validateStaff(v), {});
  assert.deepEqual(Object.keys(forms.validateStaff({ firstName: "", lastName: "", email: "", roleId: "", password: "" })).sort(), ["email", "firstName", "lastName", "password", "roleId"]);
  assert.ok(forms.validateStaff({ ...v, email: "nope" }).email);
  assert.ok(forms.validateStaff({ ...v, password: "short-11-ch" }).password);
  assert.equal(forms.validateStaff({ ...v, password: "exactly12chr" }).password, undefined);
});

test("the generated password is long, unambiguous and mixed; two of them differ", () => {
  for (let i = 0; i < 50; i += 1) {
    const p = forms.generatePassword();
    assert.equal(p.length, 16);
    assert.match(p, /[a-z]/); assert.match(p, /[A-Z]/); assert.match(p, /[0-9]/); assert.match(p, /[-_.!#]/);
    assert.doesNotMatch(p, /[0OIl1]/, "no look-alikes");
    assert.equal(forms.validateStaff({ firstName: "a", lastName: "b", email: "a@b.uz", roleId: "r", password: p }).password, undefined);
  }
  assert.notEqual(forms.generatePassword(), forms.generatePassword());
  let n = 0;
  const steady = forms.generatePassword((max) => (n++) % max);
  assert.equal(steady.length, 16, "works with any random source");
});

test("reasons, notes, limits", () => {
  assert.ok(forms.validateReason(""));
  assert.ok(forms.validateReason("  ab "));
  assert.equal(forms.validateReason("неоплата"), null);
  assert.ok(forms.validateReason("а".repeat(501)));
  assert.ok(forms.validateNote("   "));
  assert.equal(forms.validateNote("позвонили, перезвонят"), null);
  assert.deepEqual(forms.validateLimits({ students: "500", teachers: "50" }), {});
  assert.ok(forms.validateLimits({ students: "0", teachers: "50" }).students);
  assert.ok(forms.validateLimits({ students: "100001", teachers: "50" }).students);
  assert.ok(forms.validateLimits({ students: "500", teachers: "10001" }).teachers);
  assert.ok(forms.validateLimits({ students: "", teachers: "" }).teachers);
  assert.deepEqual(forms.limitWarnings({ students: "50", teachers: "50" }, { students: 120, teachers: 8 }), ["Лимит учеников (50) ниже текущего числа (120)."]);
  assert.deepEqual(forms.limitWarnings({ students: "500", teachers: "5" }, { students: 120, teachers: 8 }), ["Лимит учителей (5) ниже текущего числа (8)."]);
  assert.deepEqual(forms.limitWarnings({ students: "500", teachers: "50" }, { students: 120, teachers: 8 }), []);
});

test("role editor: checkboxes keep the catalogue order; the dirty check ignores order; a role needs a name", () => {
  const catalogue = ["requests.view", "requests.manage", "orgs.view", "orgs.manage"];
  assert.deepEqual(forms.togglePermission(["orgs.view"], "requests.view", true, catalogue), ["requests.view", "orgs.view"]);
  assert.deepEqual(forms.togglePermission(["requests.view", "orgs.view"], "requests.view", false, catalogue), ["orgs.view"]);
  assert.deepEqual(forms.togglePermission([], "orgs.view", true, catalogue), ["orgs.view"]);
  assert.equal(forms.samePermissions(["a", "b"], ["b", "a"]), true);
  assert.equal(forms.samePermissions(["a"], ["a", "b"]), false);
  assert.ok(forms.validateRoleName("  "));
  assert.ok(forms.validateRoleName("а".repeat(81)));
  assert.equal(forms.validateRoleName("Продажи"), null);
});

// ---- queries, labels, time -------------------------------------------------------------------------------------

test("filters become API parameters: empty values dropped, dates only when real, server sort fields", () => {
  const q = queries.requestsQuery({ ...queries.EMPTY_REQUEST_FILTERS, q: "  альфа ", status: "new", repeat: "true", dateFrom: "2026-10-01", dateTo: "01.10" }, 3, { key: "created_at", order: "desc" });
  assert.deepEqual(q, { page: 3, page_size: 25, sort: "created_at", order: "desc", q: "альфа", status: "new", city: undefined, source: undefined, repeat: true, date_from: "2026-10-01", date_to: undefined });
  assert.equal(queries.requestsQuery(queries.EMPTY_REQUEST_FILTERS, 1, { key: "status", order: "asc" }).repeat, undefined);
  assert.equal(queries.canSearchUsers({ q: "i", role: "", status: "" }), false);
  assert.equal(queries.canSearchUsers({ q: "iv", role: "", status: "" }), true);
  assert.equal(queries.canSearchUsers({ q: "", role: "owner", status: "" }), true);
  assert.equal(queries.auditQuery({ ...queries.EMPTY_AUDIT_FILTERS, action: "org.blocked", targetType: "org" }, 1, "desc").action, "org.blocked");
  assert.equal(queries.hasFilters(queries.EMPTY_ORG_FILTERS), false);
  assert.equal(queries.hasFilters({ ...queries.EMPTY_ORG_FILTERS, q: "x" }), true);
});

test("labels and time: Russian statuses, the Tashkent clock for the server's UTC", () => {
  assert.deepEqual(labels.REQUEST_STATUSES.map((s) => s.label), ["Новая", "Связались", "Демо проведено", "Одобрена", "Отказ", "Спам"]);
  assert.deepEqual(labels.MANUAL_REQUEST_STATUSES.map((s) => s.value), ["new", "contacted", "demo_done", "spam"], "approved / declined only through their own dialogs");
  assert.equal(labels.isFinalRequest("approved"), true);
  assert.equal(labels.isFinalRequest("new"), false);
  assert.equal(labels.orgStatus("blocked").label, "Заблокирован");
  assert.deepEqual(labels.orgStatus("suspended"), { label: "Приостановлен", tone: "amber" });
  assert.match(read("console/src/components/centres.tsx"), /value: "suspended", label: "Приостановленные"/);
  assert.match(read("console/src/lib/types.ts"), /OrgStatus = [^;]*"suspended"/);
  assert.equal(labels.userStatus("never_logged_in").label, "Не входил");
  assert.equal(fmt.fmtDateTime("2026-10-25T09:30:00Z"), "25.10.2026 14:30");
  assert.equal(fmt.fmtDateTime("2026-10-25T20:30:00Z"), "26.10.2026 01:30", "the day changes at Tashkent midnight, not UTC");
  assert.equal(fmt.fmtDateTime(null), "—");
  assert.equal(fmt.fmtDateTime("garbage"), "—");
  assert.equal(fmt.fmtPhone("+998901234567"), "+998 90 123 45 67");
  assert.equal(fmt.fmtCount(null), "—");
  assert.equal(fmt.fmtCount(0), "0");
  assert.equal(fmt.sourceLabel({ utm_source: "instagram", utm_campaign: "autumn" }), "instagram · autumn");
  assert.equal(fmt.sourceLabel({ referrer: "t.me" }), "t.me");
  assert.equal(fmt.sourceLabel(null), "—");
  assert.equal(fmt.initials("Арслан Д."), "АД");
});

// ---- the rules of a static export that shares the UI kit --------------------------------------------------------

const walk = (dir) => fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
  const rel = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(rel) : [rel];
});
const consoleSources = walk("console/src").filter((f) => /\.(ts|tsx)$/.test(f));

test("the console is a static export: no server code, no data of its own", () => {
  const config = read("console/next.config.js");
  assert.match(config, /output: "export"/);
  assert.match(config, /trailingSlash: true/);
  assert.match(config, /externalDir: true/);
  assert.doesNotMatch(config, /standalone|rewrites|redirects|headers\s*\(/, "an export has none of these");
  for (const file of consoleSources) {
    const source = read(file);
    assert.doesNotMatch(source, /["']use server["']|next\/headers|getServerSideProps|NextResponse|from "next\/server"/, file);
    assert.doesNotMatch(source, /process\.env\.(?!NEXT_PUBLIC_)/, `${file}: only NEXT_PUBLIC_ values exist in a static page`);
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|\bcaches\.|zustand|persist\(/, `${file}: the session lives in the HttpOnly cookie, nothing (no API answer either) is stored by the page`);
  }
  // every call of the shared client asks the network, never a cache; and no kit / shared module the console loads writes to browser storage
  assert.match(read("src/lib/http-json.ts"), /cache: "no-store"/);
  for (const shared of ["src/lib/http-json.ts", "src/lib/portable/demo-form.ts", "src/lib/business-time.ts", "src/lib/phone.ts", "src/lib/form-fields.ts", ...fs.readdirSync(path.join(root, "src/components/ui")).filter((f) => /\.tsx?$/.test(f)).map((f) => `src/components/ui/${f}`)]) {
    assert.doesNotMatch(read(shared), /localStorage|sessionStorage|indexedDB/, shared);
  }
  assert.equal(consoleSources.some((f) => /route\.ts$/.test(f)), false, "no route handlers");
  assert.equal(consoleSources.some((f) => /middleware\.ts$/.test(f)), false);
  // dynamic segments cannot be exported: the opened card is `?id=`
  assert.equal(walk("console/src/app").some((f) => /\[[^\]]+\]/.test(f)), false, "no [param] routes in a static export");
});

test("the UI kit is shared, never copied: the console imports it by the @/ alias; main build and tests do not see the console", () => {
  const consoleTs = JSON.parse(read("console/tsconfig.json"));
  assert.deepEqual(consoleTs.compilerOptions.paths["@/*"], ["../src/*"]);
  const mainTs = JSON.parse(read("tsconfig.json"));
  assert.ok(mainTs.exclude.includes("console"), "the main typecheck / build does not compile the console");
  assert.doesNotMatch(read("tailwind.config.ts"), /console/, "the cabinets' CSS does not scan the console");
  assert.match(read("console/tailwind.config.ts"), /\.\.\/src\/components\/ui\/\*\*/);
  const names = fs.readdirSync(path.join(root, "src/components/ui")).filter((f) => f.endsWith(".tsx"));
  const copies = consoleSources.filter((f) => names.includes(path.basename(f)));
  assert.deepEqual(copies, [], "a console file named like a kit component would be a copy");
  const used = new Set(consoleSources.flatMap((f) => [...read(f).matchAll(/from "@\/components\/ui\/([\w-]+)"/g)].map((m) => m[1])));
  for (const needed of ["button", "input", "modal", "select", "checkbox", "textarea", "number-input", "date-input", "toast", "row-menu", "data-load-error"]) assert.ok(used.has(needed), `the console uses the kit's ${needed}`);
  assert.equal(JSON.parse(read("package.json")).scripts["console:build"], "cd console && next build");
  assert.match(JSON.parse(read("console/package.json")).scripts.build, /next build/);
});

test("no native form controls in the console either: inputs, selects, textareas come from the UI kit", () => {
  const offenders = [];
  for (const file of consoleSources.filter((f) => f.endsWith(".tsx"))) {
    const source = read(file);
    if (/<(input|textarea|select)[\s>]/.test(source)) offenders.push(`${file}: native control`);
    for (const m of source.matchAll(/\btype=(?:"|\{\s*["'`])(date|time|datetime-local|month|week|number|checkbox|radio|range|file|color)\b/g)) offenders.push(`${file}: type="${m[1]}"`);
  }
  assert.deepEqual(offenders, []);
});

test("every state a list needs exists: loading skeleton, empty text, a load error with a retry, a busy guard on confirmations", () => {
  const table = read("console/src/components/data-table.tsx");
  assert.match(table, /animate-pulse/);
  assert.match(table, /<EmptyState/);
  assert.match(table, /<LoadFailure/);
  assert.match(table, /aria-sort/);
  assert.match(table, /aria-busy/);
  assert.match(read("console/src/components/bits.tsx"), /DataLoadError/);
  const dialog = read("console/src/components/dialogs.tsx");
  assert.match(dialog, /if \(busy\) return;/, "a second click while the call runs does nothing");
  assert.match(dialog, /busy=\{busy\}/);
  for (const screen of ["requests", "centres", "users", "audit"]) assert.match(read(`console/src/components/${screen}.tsx`), /useResource/, screen);
  // approving and blocking go through a confirmation dialog, never a bare click
  assert.match(read("console/src/components/requests.tsx"), /<ConfirmDialog[\s\S]{0,500}consoleApi\.requests\.approve/);
  assert.match(read("console/src/components/requests.tsx"), /<ConfirmDialog[\s\S]{0,700}consoleApi\.requests\.decline/);
  assert.match(read("console/src/components/centres.tsx"), /ConfirmDialog[\s\S]{0,600}consoleApi\.orgs\.block/);
  assert.match(read("console/src/components/users.tsx"), /ConfirmDialog[\s\S]{0,700}consoleApi\.users\.block/);
});
