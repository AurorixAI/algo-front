// K2-1 (access and letters), front side: A1 (the invitation goes by letter, no link in the page), A2 (no token in the page),
// A3 (the __Host- cookie names), D (the «Запомнить меня» tick reaches the server), the dead /activate page is gone.
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
const S = require(path.join(root, "src/lib/staff-lifecycle.ts"));
const { NextRequest } = require("next/server");
const { middleware } = require(path.join(root, "src/middleware.ts"));
const cookieLib = require(path.join(root, "src/lib/auth-cookie.ts"));

function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = `${dir}/${name.name}`;
    if (name.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name.name)) out.push(rel);
  }
  return out;
}

// ── A2: the page never reads, keeps or sends a token ─────────────────────────────────────────────────────────────

test("[A2] no source of the cabinet reads or keeps an access / refresh token", () => {
  const offenders = [];
  for (const file of walk("src")) {
    const source = read(file);
    // the exam attempt token (`X-Exam-Session-Token`, sessionToken) and the password-link token in the address are different things
    if (/access_token|refresh_token|refreshToken|accessToken|setFromTokens|getStoredToken|\.tokens\./.test(source)) offenders.push(file);
  }
  assert.deepEqual(offenders, []);
});

test("[A2] the store keeps no token and the persisted record has none", () => {
  const store = read("src/lib/store.ts");
  assert.doesNotMatch(store, /\btoken\b\s*:/);
  assert.match(store, /setSession: \(user, org = null\) =>/);
  const api = read("src/lib/api.ts");
  assert.doesNotMatch(api, /headers\["Authorization"\]/, "the request never carries a Bearer token of the page's own");
  assert.doesNotMatch(api, /refresh: \(refresh_token/, "the refresh call with a token in the body is gone");
});

test("[A2] the answer of the link that sets a password is {user, org}: the page signs in from the cookies", () => {
  const page = read("src/components/onboarding/set-password-page.tsx");
  assert.match(page, /setSession\(result\.user as unknown as AuthUser/);
  assert.doesNotMatch(read("src/lib/onboarding-api.ts"), /tokens/);
});

// ── the dead /activate page ─────────────────────────────────────────────────────────────────────────────────────

test("[A2] the dead /activate page and its API call are gone", () => {
  assert.equal(exists("src/app/activate/page.tsx"), false);
  assert.doesNotMatch(read("src/middleware.ts"), /\/activate/);
  assert.doesNotMatch(read("src/lib/safe-redirect.ts"), /activate/);
  assert.doesNotMatch(read("src/lib/api.ts"), /\/auth\/activate/);
});

// ── A3: the cookie names ────────────────────────────────────────────────────────────────────────────────────────

function visit(pathname, cookie) {
  const headers = cookie ? { cookie } : {};
  return middleware(new NextRequest(`https://app.example${pathname}`, { headers }));
}

test("[A3] the middleware accepts the __Host- cookie of https and the plain cookie of http development, and nothing else", () => {
  assert.equal(visit("/owner/groups", "__Host-algo_auth_token=jwt").status, 200);
  assert.equal(visit("/owner/groups", "algo_auth_token=jwt").status, 200);
  for (const cookie of [undefined, "other=1", "algo_refresh_token=x", "__Host-algo_refresh_token=x", "__Host-algo_auth_token="]) {
    const res = visit("/owner/groups", cookie);
    assert.equal(res.status, 307, String(cookie));
    assert.match(res.headers.get("location"), /\/login/);
  }
});

test("[A3] authCookieValue prefers the __Host- name and falls back to the plain one", () => {
  const jar = (map) => (name) => (name in map ? { value: map[name] } : undefined);
  assert.equal(cookieLib.authCookieValue(jar({ "__Host-algo_auth_token": "a", algo_auth_token: "b" })), "a");
  assert.equal(cookieLib.authCookieValue(jar({ algo_auth_token: "b" })), "b");
  assert.equal(cookieLib.authCookieValue(jar({})), undefined);
  assert.match(read("src/app/page.tsx"), /authCookieValue\(/);
});

// ── D: the tick reaches the server ──────────────────────────────────────────────────────────────────────────────

test("[D] the sign-in sends remember_me (off by default) and the login page passes the checkbox", async () => {
  const bodies = [];
  global.window = { location: { pathname: "/login", search: "", href: "" } };
  global.localStorage = { removeItem() {}, getItem: () => null, setItem() {} };
  global.fetch = async (url, init = {}) => {
    bodies.push({ url: String(url), body: JSON.parse(init.body || "null") });
    return { ok: true, status: 200, json: async () => ({ user: { id: "u" }, org: null }), text: async () => "{}" };
  };
  const apiFile = path.join(root, "src/lib/api.ts");
  delete require.cache[apiFile];
  const { authApi } = require(apiFile);
  await authApi.login("a@x.uz", "pw");
  await authApi.login("a@x.uz", "pw", true);
  assert.equal(bodies[0].body.remember_me, false);
  assert.equal(bodies[1].body.remember_me, true);
  assert.match(bodies[0].url, /\/auth\/login$/);
  const page = read("src/app/login/page.tsx");
  assert.match(page, /await login\(email, password, rememberMe\)/);
  assert.match(page, /useState\(false\)/, "the tick is off by default");
});

// ── A1: the invitation goes by letter ───────────────────────────────────────────────────────────────────────────

test("[A1] the owner is told «Приглашение отправлено на a***@x.uz» or the honest «Письмо не ушло»; the link is never shown", () => {
  assert.equal(S.inviteOutcomeText({ email_sent: true, email_masked: "a***@x.uz" }), "Приглашение отправлено на a***@x.uz");
  assert.equal(S.inviteOutcomeText({ email_sent: false, email_masked: "a***@x.uz" }), "Письмо не ушло, попробуйте ещё раз");
  assert.equal(S.INVITE_RESEND_LABEL, "Отправить ещё раз");
  const page = read("src/app/owner/teachers/page.tsx");
  assert.doesNotMatch(page, /handleCopy|navigator\.clipboard|Копировать|Скопировано|inv\.code|newCode|\/invite\/\$\{/);
  assert.match(page, /orgApi\.resendInvitation\(id\)/);
  assert.match(page, /resendBusy\.current/, "a second click before the repaint sends no second letter (LESSONS 27)");
  assert.match(page, /<h4 role="status"[^>]*>\{inviteOutcomeText\(sent\)\}<\/h4>/);
  assert.match(page, /Отправить приглашение/);
  assert.doesNotMatch(page, /Сгенерировать ссылку|Приглашение готово/);
});

test("[A1] the types have no code: the list row, the answer of «Пригласить» and the page of an invitation", () => {
  const types = read("src/lib/ops-b-types.ts");
  const rowBlock = types.slice(types.indexOf("export interface InvitationRow"), types.indexOf("export interface InvitationSent"));
  assert.doesNotMatch(rowBlock, /\bcode\b\s*:/);
  assert.match(types, /export interface InvitationSent \{[^}]*email_masked: string;[^}]*email_sent: boolean;/s);
  assert.match(types, /export interface InviteInfo \{[^}]*email_masked\?: string;/s);
  const api = read("src/lib/api.ts");
  assert.match(api, /createInvitation: [^\n]*\n\s*api<InvitationSent>/);
  assert.match(api, /resendInvitation: \(id: string\) =>\s*api<InvitationSent>\(`\/auth\/org\/invitations\/\$\{encodePathId\(id\)\}\/resend`, \{ method: "POST" \}\)/);
});

test("[A1] the page of an invitation shows the masked address, does not send an address and explains a replaced link", () => {
  const page = read("src/app/invite/[code]/page.tsx");
  assert.match(page, /inviteInfo\.email_masked/);
  assert.doesNotMatch(page, /email: email\.trim\(\)|setEmail|label="Email"/);
  assert.equal(S.inviteLoadErrorText({ code: "link_revoked", status: 410 }), S.INVITE_REVOKED_TEXT);
  assert.equal(S.inviteLoadErrorText({ status: 404 }), S.INVITE_NOT_FOUND_TEXT);
  assert.match(S.INVITE_REVOKED_TEXT, /заменено новым или отозвано/);
  assert.match(read("src/lib/api.ts"), /typeof error\?\.code === "string"/, "the machine code of {detail, code} answers reaches the page");
});
