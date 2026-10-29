// Console-1 (front), part 1: the invitation-only onboarding of the cabinets - the field logic of «Запросить демо» (K3 P2: the
// form itself moved to the landing, its logic is the portable module lib/portable/demo-form.ts), «Задать пароль»
// (/set-password/[token]) and the shared JSON client under them.
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
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const load = (rel) => { const f = path.join(root, rel); delete require.cache[f]; return require(f); };
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

// ONE copy of the HTTP client for every module below: `instanceof HttpError` must see the same class.
const H = require(path.join(root, "src/lib/http-json.ts"));
const D = require(path.join(root, "src/lib/portable/demo-form.ts"));
const S = require(path.join(root, "src/lib/set-password.ts"));
const { createOnboardingApi } = require(path.join(root, "src/lib/onboarding-api.ts"));

/** What the landing's client does with a refused submit: the shared JSON client raises the HttpError that the classifier reads. */
const submitDemo = (api, body) => api("/public/demo-requests", { method: "POST", body });

/** A recording fetch: `reply(call)` returns a real Response (or throws to simulate a dead network). */
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

const filled = (over = {}) => ({
  ...D.EMPTY_DEMO_FORM, fullName: "Алишер Каримов", centreName: "Учебный центр «Прогресс»", city: "Ташкент",
  phone: "+998 90 123 45 67", email: "Alisher@Center.uz", studentsCount: "120", comment: "  Хотим попробовать  ", ...over,
});

// ---- form validation: phone mask, e-mail, required fields -------------------------------------------------------

test("the phone mask: digits typed one by one, a paste in any shape, Backspace down to the prefix", () => {
  let text = D.EMPTY_DEMO_FORM.phone;
  assert.equal(text, "+998 ");
  for (const digit of "901234567") text = D.maskPhone(text + digit);
  assert.equal(text, "+998 90 123 45 67");
  for (const pasted of ["998901234567", "+998 90 123-45-67", "+998(90)1234567", "901234567", "  +998901234567  "]) {
    assert.equal(D.maskPhone(pasted), "+998 90 123 45 67", pasted);
  }
  assert.equal(D.maskPhone("+998 9"), "+998 9");
  assert.equal(D.maskPhone("+998"), "+998 ");                // Backspace on «+998 » never leaves the prefix half-erased
  assert.equal(D.maskPhone("abc"), "+998 ");
  assert.equal(D.maskPhone("99890123456789999"), "+998 90 123 45 67"); // digits beyond the number are dropped
  // the caret was at the START of the field: a digit typed in front of the prefix is still the first digit of the number
  assert.equal(D.maskPhone("9+998 "), "+998 9");
  assert.equal(D.maskPhone("0+998 9"), "+998 09");
});

test("the phone is valid only when complete, and goes to the server as +998XXXXXXXXX", () => {
  assert.equal(D.phoneForServer("+998 90 123 45 67"), "+998901234567");
  assert.equal(D.phoneForServer("+998 90 123 45"), "");
  assert.equal(D.phoneForServer(""), "");
  assert.match(D.validateDemoForm(filled({ phone: "+998 90 123" })).phone, /\+998 XX XXX XX XX/);
  assert.equal(D.validateDemoForm(filled()).phone, undefined);
});

test("e-mail: ordinary addresses pass, broken ones are named", () => {
  for (const ok of ["a@b.uz", "ivan.petrov+demo@school-1.example.com", " name@center.uz "]) assert.equal(D.isValidEmail(ok), true, ok);
  for (const bad of ["", "name", "name@", "@center.uz", "name@center", "na me@center.uz", "name@@center.uz", "name@center.u"]) assert.equal(D.isValidEmail(bad), false, bad);
  assert.match(D.validateDemoForm(filled({ email: "name@" })).email, /почту/);
  assert.equal(D.validateDemoForm(filled({ email: "" })).email, "Укажите почту");
});

test("required fields: name, centre, city, phone, e-mail; the number of students and the comment are optional", () => {
  assert.deepEqual(D.validateDemoForm(filled()), {});
  const errors = D.validateDemoForm(D.EMPTY_DEMO_FORM);
  assert.deepEqual(Object.keys(errors).sort(), ["centreName", "city", "email", "fullName", "phone"]);
  assert.deepEqual(D.validateDemoForm(filled({ studentsCount: "", comment: "" })), {});
  assert.ok(D.validateDemoForm(filled({ fullName: " " })).fullName);
  assert.ok(D.validateDemoForm(filled({ centreName: "А" })).centreName);
  assert.ok(D.validateDemoForm(filled({ city: "" })).city);
});

test("limits follow the contract: centre ≤ 200, city ≤ 100, comment ≤ 2000, students 0..100000", () => {
  assert.ok(D.validateDemoForm(filled({ centreName: "а".repeat(201) })).centreName);
  assert.equal(D.validateDemoForm(filled({ centreName: "а".repeat(200) })).centreName, undefined);
  assert.ok(D.validateDemoForm(filled({ city: "а".repeat(101) })).city);
  assert.ok(D.validateDemoForm(filled({ comment: "а".repeat(2001) })).comment);
  assert.equal(D.validateDemoForm(filled({ comment: "а".repeat(2000) })).comment, undefined);
  assert.equal(D.validateDemoForm(filled({ studentsCount: "0" })).studentsCount, undefined);
  assert.ok(D.validateDemoForm(filled({ studentsCount: "100001" })).studentsCount);
});

// ---- the body: honeypot, normalisation, UTM ---------------------------------------------------------------------

test("the body: trimmed, e-mail in lower case, phone normalised, optional fields left out, the honeypot always present", () => {
  const body = D.buildDemoBody(filled());
  assert.deepEqual(body, {
    contact_name: "Алишер Каримов", centre_name: "Учебный центр «Прогресс»", city: "Ташкент", phone: "+998901234567",
    email: "alisher@center.uz", students_count: 120, comment: "Хотим попробовать", website: "",
  });
  const bare = D.buildDemoBody(filled({ studentsCount: "", comment: "   " }));
  assert.equal("students_count" in bare, false);
  assert.equal("comment" in bare, false);
  assert.equal(bare.website, "");
  assert.equal("source" in bare, false);
  assert.equal(D.buildDemoBody(filled({ website: "http://spam.example" })).website, "http://spam.example", "what a bot typed travels as it is: the server drops the request silently");
  assert.equal(D.buildDemoBody(filled({ fullName: "  Алишер   Каримов " })).contact_name, "Алишер Каримов");
});

test("UTM and the source of the visit: tags from the address, ref as utm_source, the referrer's host only", () => {
  const s = D.captureSource("?utm_source=instagram&utm_medium=cpc&utm_campaign=autumn&utm_term=math&utm_content=a", "https://l.instagram.com/?u=secret&email=x@y.z", "app.algolab.me");
  assert.deepEqual(s, { utm_source: "instagram", utm_medium: "cpc", utm_campaign: "autumn", utm_term: "math", utm_content: "a", referrer: "l.instagram.com" });
  assert.equal(JSON.stringify(s).includes("secret"), false, "no path or query of the referrer");
  assert.equal(D.captureSource("?ref=partner7", "", "h").utm_source, "partner7");
  assert.equal(D.captureSource("?utm_source=a&ref=b", "", "h").utm_source, "a");
  assert.equal(D.captureSource("", "https://app.algolab.me/login", "app.algolab.me").referrer, undefined, "our own pages are not a source");
  assert.equal(D.captureSource("", "not a url", "h").referrer, undefined);
  assert.equal(D.captureSource("?utm_source=" + "x".repeat(400), "", "h").utm_source.length, 300);
  assert.equal(D.captureSource("?utm_source=a%00b%0Ac", "", "h").utm_source, "abc");
  // what the address lacks comes from the first page of the visit
  assert.equal(D.captureSource("", "", "h", { utm_source: "kept", landing: "/request-demo" }).utm_source, "kept");
  assert.equal(D.buildDemoBody(filled(), { utm_source: "ig" }).source.utm_source, "ig");
});

test("the tags travel through the redirect from /register and /request-demo", () => {
  assert.equal(D.sourceQuery("?utm_source=ig&utm_campaign=x&secret=1&email=a@b.c"), "?utm_source=ig&utm_campaign=x");
  assert.equal(D.sourceQuery(""), "");
  assert.equal(D.sourceQuery("?foo=bar"), "");
});

// ---- the demo form against the server: success, 422, 429, dead network, 5xx -------------------------------------

test("the body of the demo request goes as JSON to POST /public/demo-requests, no session needed", async () => {
  const { calls, fetchImpl } = recorder(() => json(201, { ok: true, message: "Заявка принята." }));
  const api = H.createJsonClient({ fetchImpl, baseUrl: "https://app.example/api/v1" });
  const result = await submitDemo(api, D.buildDemoBody(filled(), { utm_source: "ig" }));
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://app.example/api/v1/public/demo-requests");
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].headers["Content-Type"], "application/json");
  assert.equal(calls[0].body.website, "");
  assert.equal(calls[0].body.source.utm_source, "ig");
});

test("422: the server's Russian field messages land under the right fields of the form", async () => {
  const { fetchImpl } = recorder(() => json(422, { detail: "Проверьте поля", code: "validation_error", fields: { email: "Укажите корректную почту", phone: "Телефон: формат +998 XX XXX-XX-XX", contact_name: "Укажите имя" } }));
  const api = H.createJsonClient({ fetchImpl, baseUrl: "/api/v1" });
  const failure = await submitDemo(api, D.buildDemoBody(filled())).then(() => null, (e) => D.classifyDemoFailure(e));
  assert.equal(failure.kind, "fields");
  assert.deepEqual(failure.errors, { email: "Укажите корректную почту", phone: "Телефон: формат +998 XX XXX-XX-XX", fullName: "Укажите имя" });
  assert.equal(failure.message, "Проверьте отмеченные поля.");
});

test("422 in FastAPI's own shape (detail as a list) is understood too; an English framework text is never shown", async () => {
  const { fetchImpl } = recorder(() => json(422, { detail: [{ loc: ["body", "email"], msg: "value is not a valid email address" }, { loc: ["body", "city"], msg: "Укажите город" }] }));
  const api = H.createJsonClient({ fetchImpl, baseUrl: "/api/v1" });
  const failure = await submitDemo(api, D.buildDemoBody(filled())).then(() => null, (e) => D.classifyDemoFailure(e));
  assert.equal(failure.errors.city, "Укажите город");
  assert.equal(failure.errors.email, "Проверьте это поле");
});

test("429: calm text with the wait, from Retry-After or from the body", async () => {
  const { fetchImpl } = recorder(() => json(429, { detail: "Слишком много заявок. Повторите попытку позже.", code: "rate_limited", retry_after: 1800 }, { "Retry-After": "1800" }));
  const api = H.createJsonClient({ fetchImpl, baseUrl: "/api/v1" });
  const failure = await submitDemo(api, D.buildDemoBody(filled())).then(() => null, (e) => D.classifyDemoFailure(e));
  assert.equal(failure.kind, "rate_limited");
  assert.equal(failure.retryAfter, 1800);
  assert.match(failure.message, /через 30 мин/);
  const fromBody = D.classifyDemoFailure(new H.HttpError({ status: 429, message: "x", retryAfter: 40 }));
  assert.match(fromBody.message, /через 40 с/);
  assert.match(D.classifyDemoFailure(new H.HttpError({ status: 429, message: "x" })).message, /чуть позже/);
});

test("a dead network and a 5xx keep the form's data and say so without alarm", async () => {
  const dead = H.createJsonClient({ fetchImpl: async () => { throw new TypeError("fetch failed"); }, baseUrl: "/api/v1" });
  const network = await submitDemo(dead, D.buildDemoBody(filled())).then(() => null, (e) => D.classifyDemoFailure(e));
  assert.equal(network.kind, "network");
  assert.match(network.message, /сохранены в форме/);
  const broken = H.createJsonClient({ fetchImpl: async () => new Response("<html>502 Bad Gateway</html>", { status: 502 }), baseUrl: "/api/v1" });
  const server = await submitDemo(broken, D.buildDemoBody(filled())).then(() => null, (e) => D.classifyDemoFailure(e));
  assert.equal(server.kind, "server");
  assert.match(server.message, /сохранены в форме/);
  assert.doesNotMatch(server.message, /502|Bad Gateway|html/i);
});

// ---- «Задать пароль»: the four states of the link and the password rules ----------------------------------------

const inspect = (reply) => createOnboardingApi({ fetchImpl: recorder(reply).fetchImpl, baseUrl: "/api/v1" }).inspectPasswordLink("tok").then(S.linkStateFromInfo, S.linkStateFromError);

test("link state VALID: greets by name and centre", async () => {
  const state = await inspect(() => json(200, { valid: true, purpose: "centre_invite", first_name: "Иван", last_name: "Иванов", greeting: "Иван Петрович", email: "ivan@example.uz", org_name: "Учебный центр «Альфа»", expires_at: "2026-10-28T09:30:00Z" }));
  assert.deepEqual(state, { kind: "valid", name: "Иван Петрович", centre: "Учебный центр «Альфа»", email: "ivan@example.uz", purpose: "centre_invite" });
  assert.equal((await inspect(() => json(200, { valid: true, purpose: "reset", first_name: "Иван", email: "i@e.uz" }))).purpose, "reset");
  assert.equal((await inspect(() => json(200, { valid: true, first_name: "Иван" }))).name, "Иван");
});

test("link state USED / EXPIRED / REVOKED / INVALID by the server's codes", async () => {
  assert.deepEqual(await inspect(() => json(410, { detail: "Эта ссылка уже использована.", code: "link_used" })), { kind: "used" });
  assert.deepEqual(await inspect(() => json(410, { detail: "Срок действия ссылки истёк.", code: "link_expired" })), { kind: "expired" });
  assert.deepEqual(await inspect(() => json(410, { detail: "Выдана новая ссылка.", code: "link_revoked" })), { kind: "revoked" });
  assert.deepEqual(await inspect(() => json(404, { detail: "Ссылка недействительна.", code: "link_not_found" })), { kind: "invalid" });
  assert.deepEqual(await inspect(() => json(404, { detail: "Not Found" })), { kind: "invalid" });
  for (const kind of ["used", "expired", "revoked", "invalid"]) {
    assert.ok(S.DEAD_LINK_COPY[kind].title && S.DEAD_LINK_COPY[kind].text, kind);
  }
  assert.match(S.DEAD_LINK_COPY.expired.text, /Ответьте на письмо/);
});

test("link state UNAVAILABLE: a dead network or a 5xx is not «invalid» - the person may simply try again", async () => {
  assert.equal((await createOnboardingApi({ fetchImpl: async () => { throw new TypeError("x"); }, baseUrl: "/api/v1" }).inspectPasswordLink("t").then(S.linkStateFromInfo, S.linkStateFromError)).kind, "unavailable");
  assert.equal((await inspect(() => json(503, { detail: "x" }))).kind, "unavailable");
  assert.equal((await inspect(() => json(403, { detail: "Доступ центра приостановлен. Свяжитесь с ALGO", code: "org_blocked" }))).kind, "blocked");
});

test("the token is ONE path segment: nothing from the address bar walks the API", async () => {
  const { calls, fetchImpl } = recorder(() => json(404, { detail: "x", code: "link_not_found" }));
  const api = createOnboardingApi({ fetchImpl, baseUrl: "/api/v1" });
  for (const evil of ["../../auth/login", "a/b?x=1#h", "a%2Fb"]) await api.inspectPasswordLink(evil).catch(() => {});
  for (const call of calls) assert.match(call.url, /^\/api\/v1\/auth\/password-links\/[^/?#]+$/, call.url);
});

test("setting the password: body, rules, the answers that end the link", async () => {
  const ok = recorder(() => json(200, { user: { role: "owner", org_role: "owner" }, tokens: { access_token: "a", refresh_token: "r" }, org: { name: "X" } }));
  const result = await createOnboardingApi({ fetchImpl: ok.fetchImpl, baseUrl: "/api/v1" }).setPasswordByLink("tok", "longenough1", "longenough1");
  assert.equal(ok.calls[0].method, "POST");
  assert.equal(ok.calls[0].url, "/api/v1/auth/password-links/tok");
  assert.deepEqual(ok.calls[0].body, { password: "longenough1", password_confirm: "longenough1" });
  assert.equal(result.user.org_role, "owner");

  assert.deepEqual(S.passwordRules("short", "short").map((r) => r.ok), [false, true]);
  assert.deepEqual(S.passwordRules("longenough1", "other").map((r) => r.ok), [true, false]);
  assert.deepEqual(S.passwordRules("", "").map((r) => r.ok), [false, false]);
  assert.equal(S.canSetPassword("longenough1", "longenough1"), true);
  assert.equal(S.canSetPassword("short", "short"), false);
  assert.equal(S.canSetPassword("longenough1", "longenough2"), false);

  const used = createOnboardingApi({ fetchImpl: async () => json(410, { detail: "Эта ссылка уже использована.", code: "link_used" }), baseUrl: "/api/v1" });
  assert.deepEqual(await used.setPasswordByLink("t", "longenough1", "longenough1").catch(S.linkStateFromError), { kind: "used" });
  const bad = createOnboardingApi({ fetchImpl: async () => json(422, { detail: "x", code: "validation_error", fields: { password: "Пароль не короче 8 символов" } }), baseUrl: "/api/v1" });
  const error = await bad.setPasswordByLink("t", "x", "x").catch((e) => e);
  assert.equal(error.fields.password, "Пароль не короче 8 символов");
});

// ---- the shared JSON client ------------------------------------------------------------------------------------

test("http client: query string without empty values, 204 without a body, a 401 hook that a call may switch off", async () => {
  assert.equal(H.buildQuery({ a: 1, b: "", c: undefined, d: null, e: "x y", f: false }), "?a=1&e=x%20y&f=false");
  assert.equal(H.buildQuery({}), "");
  let hooked = 0;
  const { calls, fetchImpl } = recorder((call) => (call.url.endsWith("/gone") ? new Response(null, { status: 204 }) : json(401, { detail: "Войдите в консоль", code: "not_authenticated" })));
  const request = H.createJsonClient({ baseUrl: "/api/v1/platform/", fetchImpl, onUnauthorized: () => { hooked += 1; } });
  assert.equal(await request("/gone", { method: "DELETE" }), undefined);
  await request("/x").catch(() => {});
  await request("/y", { skipUnauthorizedHook: true }).catch(() => {});
  assert.equal(hooked, 1);
  assert.equal(calls[1].url, "/api/v1/platform/x");
  assert.equal(calls[0].credentials, "include");
  assert.equal(H.retryText(45), "через 45 с");
  assert.equal(H.retryText(7200), "через 2 ч");
});

// ---- the pages -------------------------------------------------------------------------------------------------

function walkSrc(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walkSrc(rel) : /\.(tsx?|ts)$/.test(e.name) ? [rel] : [];
  });
}

test("the login page points to «Запросить демо» on the landing; no door to the deleted pages is left in src", () => {
  const login = read("src/app/login/page.tsx");
  assert.match(login, /Нет доступа\?[\s\S]{0,200}href=\{DEMO_REQUEST_URL\}[\s\S]{0,120}Запросить демо/);
  assert.match(login, /const DEMO_REQUEST_URL = "\/request-demo";/);
  assert.doesNotMatch(login, /Зарегистрировать организацию|href="\/register"|href="\/request-demo"/);
  // `/` has no marketing page: no cookie -> /login
  const home = read("src/app/page.tsx");
  assert.match(home, /redirect\("\/login"\)/);
  assert.doesNotMatch(home, /request-demo|register|motion|use client/);
  assert.match(read("src/components/auth/home-redirect.tsx"), /loginHome\(user\.org_role \|\| user\.role\)/);
  // the only places that name the old paths: the redirect (site-url.ts, middleware.ts) and comments
  for (const file of walkSrc("src")) {
    if (["src/lib/site-url.ts", "src/middleware.ts", "src/lib/portable/demo-form.ts", "src/app/login/page.tsx"].includes(file)) continue;
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
    assert.doesNotMatch(code, /\/request-demo|["'`]\/register/, `${file}: an extra door to a deleted page`);
  }
  for (const gone of ["src/app/register/page.tsx", "src/app/request-demo/page.tsx", "src/components/onboarding/demo-request-page.tsx", "src/lib/demo-request.ts"]) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, gone);
  }
});

test("middleware: /set-password/<token> opens without a session, the old demo pages answer (redirect to the landing / plain page), the cabinets still need a session", () => {
  const { NextRequest } = require("next/server");
  const visit = (url) => load("src/middleware.ts").middleware(new NextRequest(`https://app.example${url}`));
  for (const url of ["/set-password/abcDEF_123-xyz", "/login"]) assert.equal(visit(url).status, 200, url);
  // no SITE_URL in the test process: no landing to go to -> the plain page (200), never a loop; with SITE_URL it is a 302 (k3-p1-p3)
  for (const url of ["/request-demo", "/register", "/register?utm_source=x"]) assert.equal(visit(url).status, 200, url);
  assert.equal(visit("/owner/dashboard").status, 307);
  assert.equal(visit("/set-password").status, 307, "no token: not an open page");
});

test("the set-password page renders its first screen", () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const setPassword = renderToStaticMarkup(React.createElement(load("src/components/onboarding/set-password-page.tsx").SetPasswordPage, { token: "t" }));
  assert.match(setPassword, /Проверяем ссылку/);
  assert.equal(D.buildDemoBody(filled()).website, "", "the honeypot key the server expects is still `website` (the landing sends it)");
});

test("no native form control outside the UI kit in the new pages (textarea included: it lives in ui/textarea.tsx)", () => {
  for (const file of ["src/components/onboarding/set-password-page.tsx", "src/components/onboarding/onboarding-shell.tsx"]) {
    const source = read(file);
    assert.doesNotMatch(source, /<(input|textarea|select)[\s>]/, file);
    assert.doesNotMatch(source, /type="(date|time|number|checkbox|radio|range|file|color)"/, file);
  }
  const textarea = read("src/components/ui/textarea.tsx");
  assert.match(textarea, /<textarea/);
  assert.match(textarea, /aria-invalid/);
});
