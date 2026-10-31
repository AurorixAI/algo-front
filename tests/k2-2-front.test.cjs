// K2-2 (access and letters, part 2), front side: B «Забыли пароль» (the page, the dead-link screens, «до ЧЧ:ММ»), C/E («⋯» of the staff list, one component for the
// owner and the administrator), G2 (the status of the letter of an invitation), F (one list of public pages, autoComplete, no-store, the messages of the sign-in,
// the screen «Доступ закрыт»), H (no superadmin). The browser side is checked by the Playwright run on the real stack (artifacts/k2/browser-check/k2b_e2e.cjs).
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
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const exists = (p) => fs.existsSync(path.join(root, p));
const lib = (name) => require(path.join(root, "src/lib", name));
const { NextRequest } = require("next/server");
const { middleware } = require(path.join(root, "src/middleware.ts"));
const { HttpError } = lib("http-json.ts");
const SP = lib("set-password.ts");
const SL = lib("staff-lifecycle.ts");
const SR = lib("safe-redirect.ts");
const PP = lib("public-pages.ts");
const FP = lib("forgot-password.ts");
const CE = lib("confirm-email.ts");
const LM = lib("login-messages.ts");
const store = lib("store.ts");

function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${name.name}`;
    if (name.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(rel);
  }
  return out;
}
const request = (pathname, cookie) => new NextRequest(new URL(`http://app.test${pathname}`), cookie ? { headers: { cookie } } : undefined);

// ── F: one list of public pages ───────────────────────────────────────────────

test("[F] the list of public pages is ONE module and the middleware and the return address read it", () => {
  assert.deepEqual([...PP.TOKEN_PAGES], ["/invite/", "/set-password/", "/confirm-email/"]);   // the same literal list is in algo-infrastructure/tests/test_k2_token_pages.py (nginx masks)
  assert.deepEqual([...PP.OPEN_PAGES], ["/login", "/forgot-password"]);
  const mw = read("src/middleware.ts");
  assert.match(mw, /from "\.\/lib\/public-pages"/);
  assert.doesNotMatch(mw, /"\/set-password\/"/, "the middleware keeps no list of its own");
  assert.doesNotMatch(read("src/lib/safe-redirect.ts"), /invite\\\//, "safe-redirect keeps no list of its own");
  for (const prefix of PP.TOKEN_PAGES) assert.ok(exists(`src/app${prefix}[${prefix === "/invite/" ? "code" : "token"}]/page.tsx`), `${prefix} has a page`);
  assert.ok(exists("src/app/forgot-password/page.tsx") && exists("src/app/login/page.tsx"));
});

test("[F] the pages of a token and the forgot page open without a cookie; a work page does not", () => {
  for (const open of ["/forgot-password", "/confirm-email/abc", "/set-password/abc", "/invite/abc", "/login", "/"]) {
    const response = middleware(request(open));
    assert.equal(response.status, 200, open);
    assert.equal(response.headers.get("location"), null, open);
  }
  const closed = middleware(request("/owner/dashboard"));
  assert.equal(closed.status, 307);
  assert.match(closed.headers.get("location"), /\/login\?redirect=%2Fowner%2Fdashboard/);
});

test("[F] a token page is never put into ?redirect= (the token stays out of the address bar and the history)", () => {
  for (const page of ["/confirm-email/TOKEN", "/set-password/TOKEN", "/invite/CODE", "/forgot-password", "/login", "/"]) {
    assert.equal(SR.loginUrlForPage(page, ""), "/login", page);
  }
  assert.match(SR.loginUrlForPage("/owner/teachers", "?tab=invites"), /^\/login\?redirect=/);
});

test("[F] the three work areas answer no-store (a back button on a shared computer does not show a panel from the cache)", () => {
  const cookie = "__Host-algo_auth_token=x; algo_auth_token=x";
  for (const area of ["/owner/payroll", "/admin/groups", "/teacher/dashboard", "/change-password"]) {
    const response = middleware(request(area, cookie));
    assert.match(response.headers.get("cache-control") ?? "", /no-store/, area);
  }
});

// ── B: the forgot page and the dead-link screens ──────────────────────────────────

test("[B] «Забыли пароль?» on the sign-in page leads to the page of the form", () => {
  const login = read("src/app/login/page.tsx");
  assert.match(login, /href="\/forgot-password"/);
  assert.doesNotMatch(login, /href="#"/);
});

test("[B] the form needs an address and, when the widget exists, the Turnstile token; the error text of a refused check asks to try again", () => {
  assert.equal(FP.forgotEmailProblem(""), "Укажите почту");
  assert.ok(FP.forgotEmailProblem("nope"));
  assert.equal(FP.forgotEmailProblem(" a@school.uz "), null);
  assert.equal(FP.canSendForgot("a@school.uz", "", true), false);
  assert.equal(FP.canSendForgot("a@school.uz", "tok", true), true);
  assert.equal(FP.canSendForgot("a@school.uz", "", false), true);
  const refused = FP.forgotErrorText(new HttpError({ status: 400, message: "x", code: "captcha_failed" }));
  assert.equal(refused.text, FP.FORGOT_CAPTCHA_TEXT);
  assert.equal(refused.resetWidget, true);                                      // a Turnstile token is single-use
  assert.match(FP.FORGOT_NEUTRAL_TEXT, /Если такая почта зарегистрирована/);
  assert.match(FP.FORGOT_NEUTRAL_TEXT, /Спам/);
  assert.match(FP.FORGOT_NEUTRAL_TEXT, /такой же, как при входе/);
});

test("[B][TS1] the Turnstile widget is loaded the way of the landing: explicit render, the onload callback, never ready() from script.onload", () => {
  const widget = read("src/components/onboarding/turnstile-widget.tsx");
  assert.match(widget, /render=explicit&onload=/);
  assert.match(widget, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.doesNotMatch(widget.replace(/\/\*[\s\S]*?\*\//g, ""), /turnstile\??\.ready\(/);
  assert.match(widget, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(widget, /"response-field": false/);
  const page = read("src/components/onboarding/forgot-password-page.tsx");
  assert.match(page, /inFlight\.current/, "a double click sends one request (LESSONS 27)");
  assert.match(page, /setResetWidget/);
});

function dead(code, purpose, status = 410) {
  return SP.linkStateFromError(new HttpError({ status, message: "m", code, body: { detail: "m", code, purpose } }));
}

test("[B][T2] a dead link of a reset offers «Запросить новую ссылку»; the welcome link of a new owner says «напишите нам»", () => {
  for (const code of ["link_expired", "link_used", "link_revoked"]) {
    const state = dead(code, "reset");
    assert.equal(state.purpose, "reset");
    assert.equal(SP.canRequestNewLink(state), true, code);
  }
  const welcome = dead("link_expired", "centre_invite");
  assert.equal(SP.canRequestNewLink(welcome), false);
  assert.match(SP.deadLinkText(welcome), /Напишите нам/);
  assert.doesNotMatch(SP.deadLinkText(welcome), /ответьте на письмо/i);
  assert.match(SP.deadLinkText(dead("link_expired", "reset")), /Запросите новую/);
  assert.doesNotMatch(SP.deadLinkText(dead("link_expired", "reset")), /ответьте на письмо/i);
  const page = read("src/components/onboarding/set-password-page.tsx");
  assert.match(page, /href="\/forgot-password"/);
  assert.match(page, /Запросить новую ссылку/);
});

test("[B] the page of a link says «действует до ЧЧ:ММ» in the time of the centres (Tashkent), the way the letter does", () => {
  assert.equal(SP.linkValidUntilText("2026-10-30T09:35:00Z"), "Ссылка действует до 14:35");
  assert.equal(SP.linkValidUntilText("2026-10-30T09:35:00"), "Ссылка действует до 14:35");     // naive UTC from a list
  assert.equal(SP.linkValidUntilText(null), "");
  assert.equal(SP.linkValidUntilText("garbage"), "");
  assert.match(read("src/components/onboarding/set-password-page.tsx"), /link-valid-until/);
});

test("[F][P8] one password hint «Минимум 8 символов» on the form of the link and on the invitation page", () => {
  assert.equal(SP.PASSWORD_HINT, "Минимум 8 символов");
  assert.equal(SP.passwordRules("1234567", "1234567")[0].text, "Минимум 8 символов");
  assert.equal(SP.passwordRules("12345678", "12345678")[0].ok, true);
  const invite = read("src/app/invite/[code]/page.tsx");
  assert.match(invite, /Минимум 8 символов/);
  assert.doesNotMatch(invite, /минимум 6|Минимум 6/);
  assert.doesNotMatch(read("src/app/owner/settings/page.tsx"), /минимум 6/i);
});

test("[F] a blocked or removed person gets the server's own text on the link page (not «Повторить»)", () => {
  const state = SP.linkStateFromError(new HttpError({ status: 403, message: "Вашу учётную запись отключил центр. Обратитесь к руководству центра.", code: "user_blocked" }));
  assert.equal(state.kind, "blocked");
  assert.match(state.message, /отключил центр/);
});

// ── E: the page of the new address ────────────────────────────────────────────────

test("[E] the states of «Подтвердить новый адрес»: a view first, dead links with their words, a taken address, a closed access", () => {
  const ok = CE.confirmStateFromInfo({ valid: true, new_email: "new@x.uz", org_name: "Альфа", first_name: "Анна" });
  assert.deepEqual(ok, { kind: "valid", newEmail: "new@x.uz", centre: "Альфа", name: "Анна" });
  const err = (status, code) => CE.confirmStateFromError(new HttpError({ status, message: "m", code }));
  assert.deepEqual(err(410, "link_used"), { kind: "dead", code: "used" });
  assert.deepEqual(err(410, "link_expired"), { kind: "dead", code: "expired" });
  assert.deepEqual(err(410, "link_revoked"), { kind: "dead", code: "revoked" });
  assert.deepEqual(err(404, "link_not_found"), { kind: "dead", code: "invalid" });
  assert.deepEqual(err(409, "email_taken"), { kind: "taken" });
  assert.equal(err(403, "access_closed").kind, "closed");
  assert.equal(CE.confirmStateFromError(new Error("x")).kind, "unavailable");
  const page = read("src/components/onboarding/confirm-email-page.tsx");
  assert.match(page, /inspectEmailChange/);
  assert.match(page, /inFlight\.current/);
});

// ── C and E: the «⋯» of the staff list ────────────────────────────────────────────

test("[C][E][R6] who sees what in the «⋯»: the owner → admin/teacher (link and e-mail), the administrator → teacher (link), nobody for himself-like rows", () => {
  assert.deepEqual(SL.canManageAccess("owner", "admin"), { password: true, email: true });
  assert.deepEqual(SL.canManageAccess("owner", "teacher"), { password: true, email: true });
  assert.deepEqual(SL.canManageAccess("owner", "owner"), { password: false, email: false });
  assert.deepEqual(SL.canManageAccess("admin", "teacher"), { password: true, email: false });
  assert.deepEqual(SL.canManageAccess("admin", "admin"), { password: false, email: false });
  assert.deepEqual(SL.canManageAccess("admin", "owner"), { password: false, email: false });
  assert.deepEqual(SL.canManageAccess("teacher", "teacher"), { password: false, email: false });
  assert.deepEqual(SL.canManageAccess(undefined, "teacher"), { password: false, email: false });
});

test("[C][E][inv12] ONE component serves the owner's list and the administrator's list; the new actions live in the existing «⋯» container", () => {
  const menu = read("src/components/staff/staff-access-menu.tsx");
  assert.match(menu, /RowMenu/);
  assert.match(menu, /inFlight\.current/, "a double click sends one letter (LESSONS 27)");
  assert.match(read("src/app/owner/teachers/page.tsx"), /<StaffAccessMenu member=\{m\} actorRole="owner"/);
  assert.match(read("src/app/admin/teachers/page.tsx"), /actorRole="admin"/);
  assert.match(read("src/components/layout/sidebar.tsx"), /href: "\/admin\/teachers", label: "Сотрудники"/);
  assert.match(SL.passwordLinkConfirmText("Анна", "a@x.uz"), /Пароль не изменится, пока сотрудник сам не задаст новый/);
  assert.equal(SL.PASSWORD_LINK_MENU_LABEL, "Отправить ссылку для смены пароля");
  assert.equal(SL.EMAIL_CHANGE_MENU_LABEL, "Изменить почту");
  // the leadership never gets the link: the API answer type has no link field
  assert.match(read("src/lib/api.ts"), /sendMemberPasswordLink: \(memberId: string\) =>\s*api<\{ email: string; message: string \}>/);
});

// ── G2: the status of the letter ─────────────────────────────────────────────────

test("[M1][G2] the list says «Письмо не ушло — отправьте ещё раз» for a failed letter and polls while one is on its way", () => {
  assert.equal(SL.inviteMailNote({ mail_status: "failed" }).text, "Письмо не ушло — отправьте ещё раз");
  assert.equal(SL.inviteMailNote({ mail_status: "pending" }).kind, "sending");
  assert.equal(SL.inviteMailNote({ mail_status: "sent" }), null);
  assert.equal(SL.inviteMailNote({}), null);
  assert.equal(SL.hasLettersOnTheirWay([{ mail_status: "sent", status: "pending" }]), false);
  assert.equal(SL.hasLettersOnTheirWay([{ mail_status: "pending", status: "pending" }]), true);
  assert.equal(SL.hasLettersOnTheirWay([{ mail_status: "pending", status: "expired" }]), false);
  assert.equal(SL.inviteOutcomeText({ mail_status: "pending", email: "a@x.uz" }), "Отправляем приглашение на a@x.uz");
  assert.equal(SL.inviteOutcomeText({ mail_status: "sent", email: "a@x.uz" }), "Приглашение отправлено на a@x.uz");
  assert.equal(SL.inviteOutcomeText({ mail_status: "failed", email: "a@x.uz" }), SL.INVITE_NOT_SENT_TEXT);
  // the polling on a clock: 2 s for the first 20 s, then 5 s, over after 150 s (the server settles a lost letter after 120 s)
  const delays = [];
  for (let elapsed = 0, step; (step = SL.invitePollDelay(elapsed)) !== null; elapsed += step) delays.push(step);
  assert.deepEqual(delays.slice(0, 10), Array(10).fill(2000));
  assert.deepEqual(delays.slice(10, 13), [5000, 5000, 5000]);
  assert.equal(SL.invitePollDelay(149999), 5000);
  assert.equal(SL.invitePollDelay(150000), null);
  assert.equal(delays.length, 10 + 26);                                            // 10 fast reads (20 s) + 26 slow reads (130 s)
  assert.ok(delays.reduce((a, b) => a + b, 0) >= 150000 && SL.INVITE_POLL_MAX_MS > 120000);
  const page = read("src/app/owner/teachers/page.tsx");
  assert.match(page, /hasLettersOnTheirWay\(invites\)/);
  assert.match(page, /invite-mail-/);
  assert.doesNotMatch(page, /email_sent/);
});

// ── F: sign-in messages, autoComplete, the screen of a closed access ─────────────────────

test("[F] the role is named only after the right password: «Эта почта — учётная запись «Учитель». Выберите её вверху»", () => {
  assert.equal(LM.roleMismatchText("teacher"), "Эта почта — учётная запись «Учитель». Выберите её вверху");
  assert.equal(LM.roleMismatchText("admin"), "Эта почта — учётная запись «Админ». Выберите её вверху");
  assert.equal(LM.roleMismatchText("owner"), "Эта почта — учётная запись «Владелец». Выберите её вверху");
  const login = read("src/app/login/page.tsx");
  assert.match(login, /setRoleMismatch\(roleMismatchText\(actualRole\)\)/);
  assert.match(login, /autoComplete="username"/);
  assert.match(login, /autoComplete="current-password"/);
});

test("[F] every password field of the cabinet has autoComplete (current-password / new-password)", () => {
  const offenders = [];
  for (const file of walk("src")) {
    const source = read(file);
    for (const match of source.matchAll(/<(?:input|Input)\b[^>]*?type=(?:"password"|\{show \? "text" : "password"\})[^>]*?>/gs)) {
      if (!/autoComplete=/.test(match[0])) offenders.push(file);
    }
  }
  assert.deepEqual([...new Set(offenders)], []);
});

test("[F] a 403 of /auth/me (the centre is not active, the access is closed) is a screen with the reason, not a loop through the sign-in", () => {
  assert.equal(store.accessProblemOf({ status: 403, message: "Центр не активен. Обратитесь в ALGO" }), "Центр не активен. Обратитесь в ALGO");
  assert.equal(store.accessProblemOf({ status: 401, message: "x" }), null);
  assert.equal(store.accessProblemOf({ status: 403, message: "" }), "Доступ закрыт. Обратитесь к руководству центра");
  assert.equal(store.accessProblemOf({ status: 403, message: "Forbidden" }), store.ACCESS_CLOSED_TEXT);       // a proxy's English text is never shown
  assert.equal(store.accessProblemOf({ status: 403 }), store.ACCESS_CLOSED_TEXT);
  assert.equal(store.accessProblemOf(null), null);
  const guard = read("src/components/auth/AuthGuard.tsx");
  assert.match(guard, /data-testid="access-closed"/);
  assert.match(guard, /accessProblem/);
});

// ── H: no superadmin ──────────────────────────────────────────────────────────

test("[H1] the role superadmin is not in the cabinet's code and the work areas know three roles", () => {
  const offenders = walk("src").filter((file) => /superadmin/i.test(read(file)));
  assert.deepEqual(offenders, []);
  const roles = lib("role-home.ts");
  assert.deepEqual(Object.keys(roles.ROLE_HOME).sort(), ["admin", "owner", "teacher"]);
  for (const file of walk("console/src")) assert.doesNotMatch(read(file), /superadmin/i, file);
});

// ── the walk of stage: honest words of a dead link, the line over the card ─────────────────────────────

test("[B][C] a dead link that was replaced / cancelled says only what is certain and offers a new one; the welcome link says «напишите нам»", () => {
  assert.equal(SP.DEAD_LINK_COPY.revoked.title, "Ссылка больше не действует");
  assert.equal(SP.DEAD_LINK_COPY.revoked.text, "После этого письма пароль уже меняли, вы вошли со своим паролем или пришла более новая ссылка. Нужен новый пароль — запросите ссылку ещё раз.");
  const reset = dead("link_revoked", "reset");
  assert.equal(SP.deadLinkText(reset), SP.DEAD_LINK_COPY.revoked.text);
  assert.equal(SP.canRequestNewLink(reset), true);                                       // the page offers «Запросить новую ссылку» for a revoked reset too
  assert.doesNotMatch(read("src/components/onboarding/set-password-page.tsx"), /link\.kind !== "revoked" && canRequestNewLink/);
  const welcome = dead("link_revoked", "centre_invite");
  assert.equal(SP.canRequestNewLink(welcome), false);
  assert.match(SP.deadLinkText(welcome), /Напишите нам — мы пришлём новую ссылку\.$/);
  assert.doesNotMatch(SP.deadLinkText(welcome), /Выдана новая|заменена новой/);
  assert.doesNotMatch(read("src/lib/set-password.ts"), /Выдана новая ссылка|заменена новой/);
});

test("[E] the page of a new address says the same about a dead link: asked again, or the password changed", () => {
  assert.equal(CE.CONFIRM_DEAD_COPY.revoked.title, "Ссылка больше не действует");
  assert.equal(CE.CONFIRM_DEAD_COPY.revoked.text, "Смену почты запросили заново или пароль изменился. Попросите владельца центра отправить ссылку ещё раз.");
});

test("[F] the line over the card: a reset (asked for or sent) — «Восстановление доступа»; the invitation as before; the page of the e-mail — «Смена почты для входа»", () => {
  assert.equal(SP.linkCaption({ kind: "valid", purpose: "reset" }), "Восстановление доступа");
  assert.equal(SP.linkCaption(dead("link_used", "reset")), "Восстановление доступа");
  assert.equal(SP.linkCaption({ kind: "valid", purpose: "centre_invite" }), "Доступ к ALGO — по приглашению");
  assert.equal(SP.linkCaption({ kind: "loading" }), "Доступ к ALGO");
  assert.equal(CE.CONFIRM_CAPTION, "Смена почты для входа");
  assert.match(read("src/components/onboarding/set-password-page.tsx"), /<NarrowPage caption=\{linkCaption\(link\)\}>/);
  assert.match(read("src/components/onboarding/confirm-email-page.tsx"), /<NarrowPage caption=\{CONFIRM_CAPTION\}>/);
  assert.doesNotMatch(read("src/components/onboarding/confirm-email-page.tsx"), /по ссылке из письма/);
});

test("the comment of the polling is the real rule (2 s, then 5 s, 150 s)", () => {
  const page = read("src/app/owner/teachers/page.tsx");
  assert.doesNotMatch(page, /at most 40 s/);
  assert.match(page, /at most 150 s/);
});
