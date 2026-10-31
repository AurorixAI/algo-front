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

test("[R3-4] the token words are ONE list (public-pages.ts): the support's mask uses exactly it, and it covers every token page, code page and masked API route", () => {
  const PP = require(path.join(root, "src/lib/public-pages.ts"));
  assert.deepEqual([...S.TOKEN_PREFIXES].sort(), [...PP.TOKEN_SEGMENTS].sort());
  for (const page of [...PP.TOKEN_PAGES, ...PP.CODE_PAGES]) {
    assert.ok(S.TOKEN_PREFIXES.has(page.replace(/\//g, "")), page);
    assert.equal(S.pageTemplate(`${page}sometokenwithlowercaseonly`), `${page}[id]`, page);
  }
  for (const word of PP.TOKEN_SEGMENTS) {
    assert.equal(S.pageTemplate(`/${word}/abc`), `/${word}/[id]`, word);
    assert.equal(S.pageTemplate(`/api/v1/auth/${word}/abc/more`), `/api/v1/auth/${word}/[id]/more`, word);
  }
  // the same words the nginx masks of the logs know (algo-infrastructure/tests/test_k4a_token_masks.py) and the auth-service holds (tests/test_k4a_support_unit.py): change TOGETHER (LESSONS 77)
  assert.deepEqual([...PP.TOKEN_SEGMENTS_MASKED_BY_NGINX].sort(), ["by-code", "confirm-email", "d", "diagnostic", "e", "email-change", "invite", "password-links", "set-password"]);
  assert.deepEqual([...PP.TOKEN_SEGMENTS_OF_THE_SUPPORT_ONLY].sort(), ["reset", "session-status", "support-login"]);
  assert.match(read("src/lib/support.ts"), /from "\.\/public-pages"/);
  assert.equal(S.pageTemplate("/api/v1/auth/password-links/abc"), "/api/v1/auth/password-links/[id]");
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

test("[R3-10] the ring belongs to one person: another user or a sign-out empties it", () => {
  S.resetClientErrors();
  S.bindClientErrorsTo("user-1");
  S.recordClientError(500, "GET", "/auth/org/groups/1");
  S.bindClientErrorsTo("user-1");                                                      // the same person (a re-render): the ring stays
  assert.equal(S.recentClientErrors().length, 1);
  S.bindClientErrorsTo("user-2");                                                      // another person on the same computer
  assert.equal(S.recentClientErrors().length, 0);
  S.recordClientError(500, "GET", "/auth/org/groups/1");
  S.bindClientErrorsTo(null);                                                          // nobody is signed in
  assert.equal(S.recentClientErrors().length, 0);
  S.recordClientError(409, "POST", "/auth/x");
  S.resetClientErrors();                                                               // the sign-out
  assert.equal(S.recentClientErrors().length, 0);
  const sidebar = read("src/components/layout/sidebar.tsx");
  assert.match(sidebar, /bindClientErrorsTo\(user\?\.id\)/);
  assert.match(sidebar, /resetClientErrors\(\);\s*logout\(\);/);
  assert.match(read("src/lib/api.ts"), /resetClientErrors\(\); \/\/ the next person/);       // a session that died by itself (endDeadSession)
  S.bindClientErrorsTo(null);
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

test("the screenshots: at most 3, only pictures; EVERY picture is drawn again as a JPEG with the long side at most 2560 (R3-11)", () => {
  assert.equal(S.screenshotProblem({ type: "image/png", size: 10 }, 0), null);
  assert.match(S.screenshotProblem({ type: "image/png", size: 10 }, 3), /не больше 3/);
  assert.match(S.screenshotProblem({ type: "application/pdf", size: 10 }, 0), /JPEG или PNG/);
  assert.match(S.screenshotProblem({ type: "", size: 10 }, 0), /JPEG или PNG/);
  assert.equal(S.screenshotProblem({ type: "image/heic", size: 10 }, 2), null);       // the browser may draw it; the server only ever sees JPEG
  assert.equal(S.sendAsIs, undefined, "no picture goes as it is: a PNG carries text blocks, a JPEG carries the place and the time");
  assert.deepEqual(S.scaledSize(4000, 3000), { width: 2560, height: 1920 });
  assert.deepEqual(S.scaledSize(1200, 4800), { width: 640, height: 2560 });
  assert.deepEqual(S.scaledSize(800, 600), { width: 800, height: 600 });
  assert.ok(S.SUPPORT_TARGET_FILE_BYTES < S.SUPPORT_MAX_FILE_BYTES);
  const image = read("src/lib/support-image.ts");
  assert.doesNotMatch(image, /sendAsIs|return \{ blob: file/, "the original file is never what is sent");
  assert.match(image, /canvas\.toBlob|toBlob\(canvas/);
  assert.match(image, /image\/jpeg/);
  assert.ok(S.SHRINK_ROUNDS >= 1 && S.SHRINK_STEP < 1);
});

test("[R3-13] why a screenshot did not go: the size, the format, the limit of 3, the network, a picture the browser cannot draw", () => {
  const api = (status, message) => Object.assign(new Error(message), { status });
  assert.equal(S.lostReason(api(413, "Снимок слишком большой (макс. 2 МБ).")), "больше 2 МБ");
  assert.equal(S.lostReason(api(415, "Нужен снимок в формате JPEG или PNG.")), "формат не подходит (нужен JPEG или PNG)");
  assert.equal(S.lostReason(api(415, "Изображение слишком большое.")), "слишком большое изображение");
  assert.equal(S.lostReason(api(409, "К обращению можно приложить не больше 3 снимков.")), "уже приложено 3 снимка");
  assert.equal(S.lostReason(api(0, "Не удалось подключиться к сервису. Проверьте соединение и повторите попытку.")), "нет связи");
  assert.match(S.lostReason(api(429, "x")), /повторите позже/);
  assert.equal(S.lostReason(new Error("Не удалось прочитать снимок. Приложите JPEG или PNG.")), "не удалось прочитать снимок. Приложите JPEG или PNG");
  assert.equal(S.lostReason(null), "не удалось загрузить");
  const dialog = read("src/components/support/support-dialog.tsx");
  assert.match(dialog, /lost\.push\(\{ name: file\.name \|\| "Снимок", reason: lostReason\(cause\) \}\)/);
  assert.doesNotMatch(dialog, /catch \{\s*lost/);
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

test("[R3-1] «Мои обращения» is a row of the profile menu AND of «Ещё», next to «Поддержка», to the page of the person's own cabinet, with the badge «есть ответ»", () => {
  const sidebar = read("src/components/layout/sidebar.tsx");
  const nav = read("src/components/layout/bottom-nav.tsx");
  assert.match(sidebar, /data-testid="profile-my-support"/);
  assert.match(sidebar, /router\.push\(supportPath\)/);
  assert.match(sidebar, /const supportPath = rawRole === "owner" \? "\/owner\/support" : role === "admin" \? "\/admin\/support" : "\/teacher\/support"/);
  assert.match(sidebar, /supportPath=\{DEMO_MODE \? undefined : supportPath\}/);
  assert.match(nav, /data-testid="more-my-support"/);
  assert.match(nav, /<Link href=\{supportPath\}/);
  assert.match(nav, /SUPPORT_MY_LABEL/);
  for (const source of [sidebar, nav]) assert.match(source, /data-testid="support-unread-badge"/);
  assert.match(sidebar, /data-testid="support-unread-dot"/);                            // the avatar: the menu is closed most of the time
  assert.ok(sidebar.indexOf("profile-support") < sidebar.indexOf("profile-my-support"));
  assert.ok(nav.indexOf("more-my-support") < nav.indexOf("more-support"));
  for (const role of ["owner", "admin", "teacher"]) assert.equal(S.supportPathOf(`/${role}/dashboard`), `/${role}/support`);
  const store = read("src/lib/support-unread.ts");
  assert.match(store, /SUPPORT_UNREAD_POLL_MS = 120_000/);
  assert.match(sidebar, /window\.setInterval\(\(\) => void useSupportUnread\.getState\(\)\.load\(\), SUPPORT_UNREAD_POLL_MS\)/);
  assert.match(sidebar, /void useSupportUnread\.getState\(\)\.load\(\);/);          // at sign-in
  assert.match(read("src/components/support/support-page.tsx"), /useSupportUnread\.getState\(\)\.load\(\)/);   // after the card is opened
  assert.match(read("src/lib/api.ts"), /unread: \(\) => api<\{ count: number \}>\("\/auth\/support\/unread"\)/);
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

test("[R3-7][R3-9] the console: cards on a phone instead of the table; the note of closing follows the kind, not the name", () => {
  const screen = read("console/src/components/support.tsx");
  assert.match(screen, /data-testid="support-cards"/);
  assert.match(screen, /md:hidden/);
  assert.match(screen, /hidden md:block/);                                               // the table stays for a computer
  assert.doesNotMatch(screen.slice(screen.indexOf('data-testid="support-cards"'), screen.indexOf("</ul>", screen.indexOf('data-testid="support-cards"'))), /line-clamp|truncate/, "no cutting on a phone");
  assert.match(screen, /№\{t\.number\}/);
  assert.equal(labels.supportResolvedNote("auto", "31.10.2026 14:00", null), "Решено 31.10.2026 14:00 автоматически: 14 дней без ответа");
  assert.equal(labels.supportResolvedNote("manual", "31.10.2026 14:00", null), "Решено 31.10.2026 14:00");   // the employee was deleted: NOT «автоматически»
  assert.equal(labels.supportResolvedNote("manual", "31.10.2026 14:00", "Сергей Поддержкин"), "Решено 31.10.2026 14:00, Сергей Поддержкин");
  assert.equal(labels.supportResolvedNote(null, "31.10.2026 14:00", null), "Решено 31.10.2026 14:00");
  assert.match(screen, /supportResolvedNote\(data\.resolved_kind/);
  assert.doesNotMatch(screen, /resolved_by \? .* : " автоматически/);
  assert.deepEqual(labels.supportMailMark("throttled", false), { text: "письмо не отправлялось: по этому обращению недавно уже писали", problem: false });
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
