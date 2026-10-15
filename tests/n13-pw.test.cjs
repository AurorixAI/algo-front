// N13 password recovery: «Забыли пароль?», the e-mailed / handed-over link, «Запомнить меня», and the
// owner's / administrator's «Ссылка для нового пароля». The server half is in auth-service/tests.
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
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, filename);
};
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest);
};
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const PR = require(path.join(root, "src/lib/password-reset.ts"));
const R = require(path.join(root, "src/lib/safe-redirect.ts"));
const { NextRequest } = require("next/server");
const { middleware } = require(path.join(root, "src/middleware.ts"));

// A token as the server makes it: 43 characters of the URL-safe alphabet.
const TOKEN = "Abc123_-xyzXYZ0987654321abcdefghijklmnopQRS";

// ---- 1. the pure rules ---------------------------------------------------------------------------

test("the new-password rule is the change-password page's rule, in one function both pages use", () => {
  assert.equal(PR.validateNewPassword("1234567", "1234567"), "Новый пароль должен быть не короче 8 символов.");
  assert.equal(PR.validateNewPassword("12345678", "12345679"), "Пароли не совпадают.");
  assert.equal(PR.validateNewPassword("12345678", "12345678"), null);
  assert.equal(PR.validateNewPassword("x".repeat(128), "x".repeat(128)), null);
  assert.match(PR.validateNewPassword("x".repeat(129), "x".repeat(129)), /не длиннее 128/);
  for (const file of ["src/app/change-password/page.tsx", "src/app/reset-password/page.tsx"]) {
    assert.match(read(file), /validateNewPassword\(next, confirm\)/, file);
  }
});

test("the forgot-password notice depends on the server's global switch only, never on the address", () => {
  assert.deepEqual(PR.forgotPasswordNotice(true), { kind: "sent", text: "Если такой аккаунт есть, мы отправили ссылку на почту." });
  assert.deepEqual(PR.forgotPasswordNotice(false), {
    kind: "not-configured",
    text: "Отправка писем пока не настроена. Попросите владельца или администратора центра выдать ссылку для нового пароля.",
  });
  assert.equal(PR.forgotPasswordNotice.length, 1, "no other input");
});

test("the token is read from the address-bar FRAGMENT only when it can be ours, and taken out of the address", () => {
  assert.equal(PR.readResetToken(`#token=${TOKEN}`), TOKEN);
  assert.equal(PR.readResetToken(`#a=1&token=${TOKEN}&b=2`), TOKEN);
  assert.equal(PR.readResetToken(`token=${TOKEN}`), TOKEN, "location.hash without the # is read the same");
  for (const bad of ["", "#", null, undefined, "#token=", "#token=short", `#token=${"a".repeat(129)}`, "#token=%2e%2e%2fadmin", "#token=a b c d e f g h i j k", "#x=1", "#token=" + "é".repeat(30)]) {
    assert.equal(PR.readResetToken(bad), null, String(bad));
  }
  // a QUERY token is not read: that form is never issued and would end up in server logs
  assert.equal(PR.readResetToken(`?token=${TOKEN}`), null);
  // what is left in the bar: the page and its query, no fragment, no token parameter
  assert.equal(PR.addressWithoutToken("/reset-password", ""), "/reset-password");
  assert.equal(PR.addressWithoutToken("/reset-password", "?lang=ru"), "/reset-password?lang=ru");
  assert.equal(PR.addressWithoutToken("/reset-password", `?lang=ru&token=${TOKEN}`), "/reset-password?lang=ru");
  assert.equal(PR.addressWithoutToken("/reset-password", `?token=${TOKEN}`), "/reset-password");
  assert.doesNotMatch(PR.addressWithoutToken("/reset-password", `?token=${TOKEN}`), new RegExp(TOKEN));
});

test("who is offered «Ссылка для нового пароля»: owner -> admins and teachers, admin -> teachers, nobody else", () => {
  const can = PR.canIssueResetLink;
  assert.equal(can("owner", "admin"), true);
  assert.equal(can("owner", "teacher"), true);
  assert.equal(can("owner", "owner"), false);
  assert.equal(can("admin", "teacher"), true);
  assert.equal(can("admin", "admin"), false);
  assert.equal(can("admin", "owner"), false);
  for (const actor of ["teacher", "superadmin", "", null, undefined]) {
    for (const member of ["owner", "admin", "teacher"]) assert.equal(can(actor, member), false, `${actor} -> ${member}`);
  }
  assert.equal(can("owner", undefined), false);
});

test("the Telegram share address carries exactly the link, encoded", () => {
  const link = `https://algolab.me/reset-password#token=${TOKEN}`;
  const url = PR.telegramShareUrl(link);
  assert.equal(url, `https://t.me/share/url?url=${encodeURIComponent(link)}`);
  const parsed = new URL(url);
  assert.equal(parsed.origin, "https://t.me");
  assert.equal(parsed.searchParams.get("url"), link);
  assert.equal([...parsed.searchParams.keys()].join(), "url");
});

test("the expiry is shown as a moment, empty for nonsense", () => {
  assert.match(PR.resetLinkExpiryText("2026-10-16T10:42:00+00:00"), /^до \d{1,2} октября, \d{2}:\d{2}$/);
  assert.equal(PR.resetLinkExpiryText(""), "");
  assert.equal(PR.resetLinkExpiryText(null), "");
  assert.equal(PR.resetLinkExpiryText("not a date"), "");
  assert.equal(PR.RESET_LINK_NOTE, "Ссылка одноразовая, действует 24 часа. Старые входы сотрудника будут завершены после смены пароля.");
  assert.equal(PR.RESET_INVALID_TEXT, "Ссылка недействительна или устарела. Попросите новую.");
  assert.equal(PR.RESET_DONE_TEXT, "Пароль изменён. Войдите с новым паролем.");
});

// ---- 2. the calls the pages make -----------------------------------------------------------------

function loadApi() {
  const file = path.join(root, "src/lib/api.ts");
  delete require.cache[file];
  return require(file);
}

function stubFetch(reply = { status: 200, body: { ok: true } }) {
  const calls = [];
  global.fetch = async (url, init = {}) => {
    calls.push({ url: new URL(url), method: init.method || "GET", headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined, credentials: init.credentials });
    return { ok: reply.status < 300, status: reply.status, json: async () => reply.body };
  };
  global.window = { location: { pathname: "/login", search: "", href: "" } };
  return calls;
}

test("login sends remember (true unless the box is cleared); the public calls carry no Authorization", async () => {
  const calls = stubFetch({ status: 200, body: { user: {}, tokens: {} } });
  const { authApi } = loadApi();
  await authApi.login("a@b.kz", "secret1");
  await authApi.login("a@b.kz", "secret1", false);
  await authApi.login("a@b.kz", "secret1", true);
  assert.deepEqual(calls.map((c) => c.body.remember), [true, false, true]);
  assert.ok(calls.every((c) => c.url.pathname === "/api/v1/auth/login" && c.method === "POST" && c.credentials === "include"));
  assert.deepEqual(calls.map((c) => c.body.email), ["a@b.kz", "a@b.kz", "a@b.kz"]);
});

test("forgot / check / reset: the right routes, the token only in the BODY of its call (never in an address)", async () => {
  const calls = stubFetch({ status: 200, body: { ok: true, email_delivery: false, valid: true } });
  const { authApi } = loadApi();
  assert.deepEqual(await authApi.forgotPassword("t@school.kz"), { ok: true, email_delivery: false, valid: true });
  await authApi.checkResetToken(TOKEN);
  await authApi.resetPassword(TOKEN, "NewPass-123");
  const [forgot, check, reset] = calls;
  assert.equal(forgot.url.pathname, "/api/v1/auth/password/forgot");
  assert.equal(forgot.method, "POST");
  assert.deepEqual(forgot.body, { email: "t@school.kz" });
  assert.equal(check.url.pathname, "/api/v1/auth/password/reset/check");
  assert.equal(check.method, "POST", "the check is a POST: a GET would put the token into the server's access log");
  assert.deepEqual(check.body, { token: TOKEN });
  assert.equal(check.url.search, "", "the token is not in the address of the check");
  assert.equal(reset.url.pathname, "/api/v1/auth/password/reset");
  assert.deepEqual(reset.body, { token: TOKEN, new_password: "NewPass-123" });
  assert.equal(reset.url.search, "", "the token is not repeated in the address of the POST");
  for (const call of calls) assert.equal(call.headers.Authorization, undefined, "public calls never send a Bearer token");
});

test("a dead link is a 400 with the server's own sentence", async () => {
  stubFetch({ status: 400, body: { detail: "Ссылка недействительна или устарела. Попросите новую." } });
  const { authApi } = loadApi();
  await assert.rejects(authApi.resetPassword(TOKEN, "NewPass-123"), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.message, PR.RESET_INVALID_TEXT);
    return true;
  });
});

test("issuing a staff link is one authenticated POST to the person's route, the id encoded", async () => {
  const calls = stubFetch({ status: 200, body: { url: "https://algolab.me/reset-password#token=x", expires_at: "2026-10-16T10:42:00+00:00" } });
  const { authApi } = loadApi();
  const answer = await authApi.issuePasswordResetLink("3f1c9e0e-5b57-4c3e-9a4e-0d9f3c8a7b11");
  assert.equal(answer.url, "https://algolab.me/reset-password#token=x");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "POST");
  assert.equal(calls[0].url.pathname, "/api/v1/auth/staff/3f1c9e0e-5b57-4c3e-9a4e-0d9f3c8a7b11/password-reset-link");
  assert.equal(calls[0].credentials, "include", "the session cookie is what authenticates it");
  await authApi.issuePasswordResetLink("a/b");
  assert.equal(calls[1].url.pathname, "/api/v1/auth/staff/a%2Fb/password-reset-link", "an id can never add path segments");
});

// ---- 3. the sign-in page, the middleware ----------------------------------------------------------

test("the sign-in page: «Забыли пароль?» goes to /forgot-password, «Запомнить меня» is on and is sent", () => {
  const page = read("src/app/login/page.tsx");
  assert.match(page, /const \[rememberMe, setRememberMe\] = useState\(true\);/);
  assert.match(page, /await login\(email, password, rememberMe\);/);
  assert.match(page, /<Link\s+href="\/forgot-password"[^>]*>\s*Забыли пароль\?\s*<\/Link>/);
  assert.doesNotMatch(page, /href="#"/, "no dead link");
  // the safe-redirect contract of the page is untouched
  assert.equal((page.match(/get\("redirect"\)/g) || []).length, 1);
  const store = read("src/lib/store.ts");
  assert.match(store, /login: async \(email, password, remember = true\)/);
  assert.match(store, /authApi\.login\(email, password, remember\)/);
});

const visit = (url, cookie) =>
  middleware(new NextRequest(`https://algo.example${url}`, cookie ? { headers: { cookie } } : undefined));

test("/forgot-password and /reset-password are open to somebody who cannot sign in - and never bounce through /login?redirect=", () => {
  for (const url of ["/forgot-password", "/reset-password", `/reset-password#token=${TOKEN}`]) {
    const response = visit(url);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get("location"), null, `${url} must not redirect (the redirect value would carry the token)`);
  }
  // as a return target after a dead session: the bare login, never the page with its secret
  assert.equal(R.loginUrlForPage("/reset-password", ""), "/login");
  assert.equal(R.loginUrlForPage("/reset-password", `?token=${TOKEN}`), "/login");
  assert.equal(R.loginUrlForPage("/forgot-password", ""), "/login");
  // a neighbouring path is not public by accident
  assert.equal(visit("/reset-password-x").status, 307);
});

// ---- 4. the pages ----------------------------------------------------------------------------------

function render(file, props = {}, exportName = "default") {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const mod = require(path.join(root, file));
  return renderToStaticMarkup(React.createElement(mod[exportName], props));
}
const plain = (html) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;| /g, " ").replace(/\s+/g, " ").trim();

test("/forgot-password: an e-mail field, the send button and the way back to the sign-in", () => {
  const html = render("src/app/forgot-password/page.tsx");
  assert.match(html, /<input[^>]*type="email"[^>]*>/);
  assert.match(plain(html), /Отправить ссылку/);
  assert.match(html, /<a[^>]*href="\/login"[^>]*>[\s\S]*Вернуться ко входу/);
  const src = read("src/app/forgot-password/page.tsx");
  assert.match(src, /authApi\.forgotPassword\(address\)/);
  assert.match(src, /forgotPasswordNotice\(answer\?\.email_delivery === true\)/);
  // the page's wording comes from one place and does not look at the address
  assert.doesNotMatch(src, /Если такой аккаунт|Отправка писем пока не настроена/);
});

test("/reset-password: reads the token once, removes it from the address, keeps it in memory only", () => {
  const src = read("src/app/reset-password/page.tsx");
  assert.match(src, /readResetToken\(window\.location\.hash\)/);
  assert.doesNotMatch(src, /location\.search\)\s*;?\s*$|readResetToken\(window\.location\.search/m, "the token is read from the fragment only");
  assert.match(src, /window\.history\.replaceState\(null, "", addressWithoutToken\(RESET_PATH, window\.location\.search\)\)/);
  assert.ok(src.indexOf("readResetToken(") < src.indexOf("replaceState("), "read first, then remove");
  assert.equal((src.match(/readResetToken\(/g) || []).length, 1, "read exactly once");
  assert.doesNotMatch(src, /localStorage|sessionStorage|document\.cookie|console\.(log|info|debug)/, "the token goes nowhere");
  assert.doesNotMatch(src, /router\.(push|replace)|location\.href\s*=|window\.open/, "no navigation with the token");
  assert.match(src, /authApi\s*\.checkResetToken\(token\)/);
  assert.match(src, /authApi\.resetPassword\(token, next\)/);
  // invalid -> the sentence and the way to ask for a new one; done -> the sentence and /login, prefilling nothing
  assert.match(src, /RESET_INVALID_TEXT/);
  assert.match(src, /href="\/forgot-password"/);
  assert.match(src, /RESET_DONE_TEXT/);
  assert.match(src, /href="\/login"/);
  assert.doesNotMatch(src, /href=\{?[`"']\/login\?/, "nothing is pre-filled on the sign-in");
  assert.match(src, /e\?\.status === 400/);
  // the first paint is a spinner (the server cannot know the token)
  assert.match(plain(render("src/app/reset-password/page.tsx")), /^∫ ALGO Новый пароль/);
});

test("/reset-password never leaks its address: meta referrer, response headers, noindex", () => {
  const layout = read("src/app/reset-password/layout.tsx");
  assert.match(layout, /referrer: "no-referrer"/);
  assert.match(layout, /robots: \{ index: false, follow: false \}/);
  const config = require(path.join(root, "next.config.js"));
  return config.headers().then((rules) => {
    const rule = rules.find((r) => r.source === "/reset-password");
    assert.ok(rule, "a header rule for the page");
    const headers = Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
    assert.equal(headers["Referrer-Policy"], "no-referrer");
    assert.equal(headers["Cache-Control"], "no-store");
    assert.match(headers["X-Robots-Tag"], /noindex/);
  });
});

// ---- 5. «Ссылка для нового пароля» ----------------------------------------------------------------

const MODAL = "src/components/staff/password-reset-link-modal.tsx";

test("the link dialog shows the link, copy, Telegram, the expiry and the note", () => {
  const url = `https://algolab.me/reset-password?token=${TOKEN}`;
  const html = render(MODAL, { state: { status: "ready", url, expiresAt: "2026-10-16T10:42:00+00:00" }, copied: false }, "PasswordResetLinkBody");
  assert.ok(html.includes(`value="${url}"`), "the link in a read-only field");
  assert.match(html, /readOnly=""|readonly=""/);
  const text = plain(html);
  assert.match(text, /Копировать/);
  assert.match(text, /Отправить в Telegram/);
  assert.match(text, /Действует до \d{1,2} октября, \d{2}:\d{2}/);
  assert.ok(text.includes("Ссылка одноразовая, действует 24 часа. Старые входы сотрудника будут завершены после смены пароля."));
  const telegram = html.match(/<a[^>]*href="([^"]+)"[^>]*>/);
  assert.ok(telegram, "Telegram anchor");
  assert.equal(telegram[1].replace(/&amp;/g, "&"), PR.telegramShareUrl(url));
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(plain(render(MODAL, { state: { status: "ready", url, expiresAt: "x" }, copied: true }, "PasswordResetLinkBody")), /Скопировано/);
});

test("the link dialog: a spinner while the link is made, the server's sentence when it is refused", () => {
  assert.match(render(MODAL, { state: { status: "loading" } }, "PasswordResetLinkBody"), /Готовим ссылку/);
  const html = render(MODAL, { state: { status: "error", message: "Сотрудник не найден" }, onRetry() {} }, "PasswordResetLinkBody");
  assert.match(html, /role="alert"/);
  assert.match(plain(html), /Сотрудник не найден/);
  assert.match(plain(html), /Повторить/);
  assert.doesNotMatch(html, /t\.me/);
  const src = read(MODAL);
  assert.match(src, /authApi\s*\.issuePasswordResetLink\(memberId\)/);
  assert.match(src, /title=\{RESET_LINK_MENU_LABEL\}/);
});

test("owner «Сотрудники»: the action sits in the row's «⋯» menu, named by the person, only where the server would allow it", () => {
  const page = read("src/app/owner/teachers/page.tsx");
  assert.match(page, /label=\{`Действия: \$\{memberName\(m\)\}`\}/);
  assert.match(page, /\{canIssueResetLink\(actorRole, m\.org_role\) && \(\s*<RowMenu/);
  assert.match(page, /label: RESET_LINK_MENU_LABEL/);
  assert.match(page, /setResetFor\(\{ id: m\.id, name: memberName\(m\) \}\)/, "the USER id (not the membership id) is what the route takes");
  assert.match(page, /<PasswordResetLinkModal member=\{resetFor\} onClose=\{\(\) => setResetFor\(null\)\} \/>/);
  // the owner's own row and the removal button are untouched
  assert.match(page, /handleRemoveMember\(m\.member_id\)/);
  assert.equal(PR.RESET_LINK_MENU_LABEL, "Ссылка для нового пароля");
});

test("administrator «Учителя»: teachers only, one action, in the sidebar, no owner links", () => {
  const page = read("src/app/admin/teachers/page.tsx");
  assert.match(page, /members\.filter\(\(m\) => m\.org_role === "teacher"\)/);
  assert.match(page, /canIssueResetLink\(actorRole, m\.org_role\)/);
  assert.match(page, /label=\{`Действия: \$\{memberName\(m\)\}`\}/);
  assert.doesNotMatch(page, /["'`]\/owner\//);
  const sidebar = read("src/components/layout/sidebar.tsx");
  const adminNav = sidebar.slice(sidebar.indexOf("const adminNav"), sidebar.indexOf("const ownerNav"));
  assert.match(adminNav, /\{ href: "\/admin\/teachers", label: "Учителя", icon: UserCog \}/);
  // the admin workspace guard lets administrators (and owners) in, nobody else
  assert.match(read("src/app/admin/layout.tsx"), /allowedRoles=\{\["admin", "owner"\]\}/);
});

// ---- 6. /activate for a visitor who is not signed in -----------------------------------------------

test("/activate is open without a cookie (the owner clicks the e-mail link before any sign-in)", () => {
  for (const url of ["/activate", "/activate?token=abc123"]) {
    const response = visit(url);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get("location"), null, url);
  }
  assert.equal(visit("/activate-x").status, 307, "a neighbouring path is not public by accident");
  assert.equal(R.loginUrlForPage("/activate", "?token=abc"), "/login", "never a sign-in return target");
});

test("the activation page works for a signed-out visitor: one public POST that signs the owner in", async () => {
  const src = read("src/app/activate/page.tsx");
  assert.doesNotMatch(src, /AuthGuard/);
  assert.match(src, /authApi\.activate\(activeToken\)/);
  assert.match(src, /setFromTokens\(/);
  const calls = stubFetch({ status: 200, body: { user: { id: "u1", role: "owner" }, tokens: { access_token: "a", refresh_token: "r" }, org: { name: "Центр" } } });
  const { authApi } = loadApi();
  const answer = await authApi.activate("activation-token-123");
  assert.equal(answer.user.id, "u1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url.pathname, "/api/v1/auth/activate");
  assert.equal(calls[0].method, "POST");
  assert.deepEqual(calls[0].body, { token: "activation-token-123" });
  assert.equal(calls[0].headers.Authorization, undefined, "no session is needed");
  assert.equal(calls[0].credentials, "include", "the cookies the server sets must be accepted");
  // after success the page goes on to the admin area, which the new cookie now opens
  assert.match(src, /router\.push\("\/admin\/diagnostics"\)/);
});
