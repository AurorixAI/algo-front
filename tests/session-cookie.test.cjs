// An idle hour must not sign the user out: the access cookie now lives 30 days (the JWT inside 60 minutes),
// so the middleware lets the page through and the first API call refreshes the session.
// Covers: the return URL kept by the middleware, the login page following it safely (no open redirect),
// and the client flow with a stale JWT in the cookie (401 -> one refresh -> retry; no false logout).
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
const R = require(path.join(root, "src/lib/safe-redirect.ts"));
const S = require(path.join(root, "src/lib/session-sync.ts"));
const { NextRequest } = require("next/server");
const { middleware } = require(path.join(root, "src/middleware.ts"));

// ---- 1. what the sign-in page may follow ------------------------------------------------------

test("safeRedirectPath keeps a same-site path with its query", () => {
  for (const ok of [
    "/owner/settings?section=payments",
    "/teacher/groups/abc?tab=payments&x=1",
    "/admin/diagnostics",
    "/owner/students/42?tab=payments#history",
    "/teacher/search?q=%D0%90%D0%BB%D0%B8%D1%8F",
    "/owner/files/a%2Fb",
  ]) assert.equal(R.safeRedirectPath(ok), ok, ok);
});

test("safeRedirectPath refuses everything that could leave the site", () => {
  const bad = [
    "//evil.com", "//evil.com/owner", "///evil.com", "/\\evil.com", "/\\/evil.com", "\\\\evil.com", "\\evil",
    "https://evil.com", "http://evil.com/owner", "HTTPS://evil.com", "javascript:alert(1)", "JaVaScRiPt:alert(1)",
    "data:text/html,<script>1</script>", "evil.com", "owner/settings", "%2F%2Fevil.com", " //evil.com", " /owner",
    "/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\u0000/evil.com", "/ow\tner", "/owner\\..\\evil",
    "/..//evil.com", "/a/../..//evil.com", "/./\\evil.com",
    "", "/", "x".repeat(5000), "/" + "x".repeat(3000),
    "/login", "/login?redirect=/owner", "/login/", "/api/v1/auth/logout", "/_next/static/x.js",
  ];
  for (const value of bad) {
    // "/" alone is the public landing page: a valid path, covered below
    if (value === "/") continue;
    assert.equal(R.safeRedirectPath(value), null, JSON.stringify(value));
  }
  for (const value of [null, undefined, 0, 5, {}, [], ["/owner"], true]) assert.equal(R.safeRedirectPath(value), null);
  // /logins and /apiary are ordinary pages, only the exact /login, /api and /_next trees are excluded
  assert.equal(R.safeRedirectPath("/logins"), "/logins");
  assert.equal(R.safeRedirectPath("/"), "/");
});

test("whatever safeRedirectPath returns is a path on this site (fuzz)", () => {
  const alphabet = ["/", "\\", ".", "%2F", "%5C", "\t", "\n", "?", "#", "a", ":", "@", "/", "//", "..", "http", "x", " "];
  let seed = 12345;
  const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
  for (let i = 0; i < 20000; i++) {
    let value = i % 3 === 0 ? "/" : "";
    for (let k = 0, n = next() % 8; k < n; k++) value += alphabet[next() % alphabet.length];
    const out = R.safeRedirectPath(value);
    if (out === null) continue;
    assert.ok(out.startsWith("/") && !out.startsWith("//") && !out.startsWith("/\\"), `${JSON.stringify(value)} -> ${out}`);
    assert.equal(new URL(out, "https://algo.example").origin, "https://algo.example", `${JSON.stringify(value)} -> ${out}`);
    assert.doesNotMatch(out, /[\\\u0000-\u001f]/);
  }
});

test("withoutInternalParams drops only Next's _rsc and keeps the user's query byte for byte", () => {
  assert.equal(R.withoutInternalParams("?section=payments&_rsc=abc12"), "?section=payments");
  assert.equal(R.withoutInternalParams("?_rsc=abc12"), "");
  assert.equal(R.withoutInternalParams("?a=1&_rsc=x&b=%D0%B0+1&c"), "?a=1&b=%D0%B0+1&c");
  assert.equal(R.withoutInternalParams("?_rscx=1&x_rsc=2"), "?_rscx=1&x_rsc=2");
  assert.equal(R.withoutInternalParams(""), "");
  assert.equal(R.withoutInternalParams(null), "");
  assert.equal(R.loginReturnTarget("/owner/settings", "?section=payments&_rsc=q"), "/owner/settings?section=payments");
  assert.equal(R.loginReturnTarget("/owner/settings", ""), "/owner/settings");
});

test("after sign-in: the page the visitor came from, if this role may open it, else the role's home", () => {
  const to = R.postLoginTarget;
  assert.equal(to("/owner/settings?section=payments", "owner"), "/owner/settings?section=payments");
  assert.equal(to("/teacher/groups?x=1", "teacher"), "/teacher/groups?x=1");
  assert.equal(to("/admin/exams", "admin"), "/admin/exams");
  assert.equal(to("/admin/exams", "owner"), "/admin/exams"); // an owner may use /admin/*
  // wrong workspace for the role: not followed (the layout guard would refuse it anyway)
  assert.equal(to("/owner/settings", "teacher"), "/teacher/dashboard");
  assert.equal(to("/owner/settings", "admin"), "/admin/diagnostics");
  assert.equal(to("/teacher/dashboard", "owner"), "/owner/dashboard");
  assert.equal(to("/owner/settings", undefined), "/admin/diagnostics");
  assert.equal(to("/ownership", "teacher"), "/ownership"); // not a workspace prefix
  // nothing / unsafe -> the role's home, exactly as before this change
  for (const unsafe of [null, undefined, "", "//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/login"]) {
    assert.equal(to(unsafe, "owner"), "/owner/dashboard", String(unsafe));
    assert.equal(to(unsafe, "teacher"), "/teacher/dashboard", String(unsafe));
    assert.equal(to(unsafe, "nobody"), "/admin/diagnostics", String(unsafe));
  }
});

test("the login page follows ?redirect= only through postLoginTarget", () => {
  const page = read("src/app/login/page.tsx");
  assert.match(page, /postLoginTarget\(\s*new URLSearchParams\(window\.location\.search\)\.get\("redirect"\),\s*actualRole,?\s*\)/);
  // no other use of the parameter: no raw assignment of it anywhere
  assert.equal((page.match(/get\("redirect"\)/g) || []).length, 1);
  assert.doesNotMatch(page, /router\.(push|replace)\([^)]*redirect/);
  assert.doesNotMatch(page, /location\.href = (?!postLoginTarget)/);
});

// ---- 2. the middleware ----------------------------------------------------------------------

// The URL is glued, not resolved: a request line "GET //evil.com/x" on host algo.example stays on that host.
const visit = (url, cookie) =>
  middleware(new NextRequest(`https://algo.example${url}`, cookie ? { headers: { cookie } } : undefined));
const location = (response) => new URL(response.headers.get("location"), "https://algo.example");

test("no cookie: to /login with the whole page asked for, path and query", () => {
  const res = visit("/owner/settings?section=payments");
  assert.equal(res.status, 307);
  const to = location(res);
  assert.equal(to.pathname, "/login");
  assert.equal(to.searchParams.get("redirect"), "/owner/settings?section=payments");
  // and the sign-in page would take it back as it is
  assert.equal(R.postLoginTarget(to.searchParams.get("redirect"), "owner"), "/owner/settings?section=payments");
});

test("no cookie: a path without a query, an encoded query and Next's own _rsc parameter", () => {
  assert.equal(location(visit("/teacher/groups")).searchParams.get("redirect"), "/teacher/groups");
  assert.equal(
    location(visit("/teacher/search?q=%D0%90%D0%BB%D0%B8%D1%8F&tab=payments")).searchParams.get("redirect"),
    "/teacher/search?q=%D0%90%D0%BB%D0%B8%D1%8F&tab=payments",
  );
  assert.equal(
    location(visit("/owner/settings?section=payments&_rsc=1abcd")).searchParams.get("redirect"),
    "/owner/settings?section=payments",
  );
});

test("no cookie: a hostile path never becomes a redirect that leaves the site", () => {
  // protocol-relative request path: nothing worth coming back to, so no `redirect` at all
  // (a host with a dot would be skipped by the middleware as a "static file" before any redirect)
  for (const url of ["//evil/owner", "///evil", "//evil"]) {
    const hostile = location(visit(url));
    assert.equal(hostile.origin, "https://algo.example", url);
    assert.equal(hostile.pathname, "/login", url);
    assert.equal(hostile.searchParams.get("redirect"), null, url);
  }
  // a query that merely contains a URL is part of an ordinary same-site path and stays inside it
  const inner = location(visit("/owner/settings?next=//evil.com&u=https://evil.com"));
  assert.equal(inner.origin, "https://algo.example");
  const back = inner.searchParams.get("redirect");
  assert.equal(back, "/owner/settings?next=//evil.com&u=https://evil.com");
  assert.equal(R.postLoginTarget(back, "owner"), back);
  assert.equal(new URL(R.postLoginTarget(back, "owner"), "https://algo.example").origin, "https://algo.example");
});

test("a cookie, even one holding an expired JWT, lets the page through: the first API call refreshes", () => {
  // The middleware cannot refresh and does not look inside the cookie; a stale JWT is the API's 401.
  for (const cookie of ["algo_auth_token=eyJ.stale.jwt", "algo_auth_token=x; algo_refresh_token=y", "algo_demo_session=1"]) {
    const res = visit("/owner/settings?section=payments", cookie);
    assert.equal(res.status, 200, cookie);
    assert.equal(res.headers.get("location"), null);
  }
  assert.match(visit("/teacher/groups", "algo_auth_token=a").headers.get("cache-control"), /no-store/);
});

test("public and code-based pages never need the cookie", () => {
  for (const url of ["/", "/login?redirect=%2Fowner", "/register", "/forgot-password", "/e/ABC123", "/d/ABC123", "/invite/X", "/diagnostic/Y", "/_next/static/a.js", "/api/demo/v1/auth/me"]) {
    assert.equal(visit(url).status, 200, url);
  }
});

// ---- 3. the client with a stale JWT in the cookie -------------------------------------------

function loadApi() {
  const file = path.join(root, "src/lib/api.ts");
  delete require.cache[file];
  return require(file);
}

/** A browser + server in miniature: fetch answers 401 while the cookie is stale, /auth/refresh renews it once per token. */
function world({ refreshWorks = true, otherStatus = null, locks = null } = {}) {
  const state = { cookie: "stale", refreshCalls: 0, refreshToken: "r1", log: [], locationHref: null, removed: [], assigned: 0 };
  global.window = {
    location: {
      pathname: "/owner/settings",
      search: "?section=payments",
      get href() { return state.locationHref; },
      set href(value) { state.assigned += 1; state.locationHref = value; },
    },
  };
  global.localStorage = { removeItem: (key) => state.removed.push(key), getItem: () => null, setItem() {} };
  Object.defineProperty(globalThis, "navigator", { value: { locks }, configurable: true, writable: true });
  const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });
  global.fetch = async (url, init = {}) => {
    const u = new URL(url);
    state.log.push(`${init.method || "GET"} ${u.pathname} cookie=${state.cookie}`);
    if (u.pathname.endsWith("/auth/refresh")) {
      state.refreshCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10)); // the server takes a moment
      if (!refreshWorks || state.refreshToken !== "r1") return reply(401, { detail: "Refresh token отозван" });
      state.refreshToken = "r2"; // ROTATED: the old token is dead from now on
      state.cookie = "fresh";
      return reply(200, { access_token: "fresh", refresh_token: "r2" });
    }
    if (state.cookie !== "fresh" && !(init.headers && init.headers.Authorization === "Bearer fresh")) {
      return reply(401, { detail: "Невалидный или истёкший токен" });
    }
    if (otherStatus) return reply(otherStatus, { detail: "Нельзя" });
    return reply(200, { id: "u1", role: "owner", org_role: "owner", url: u.pathname });
  };
  return state;
}

test("a stale JWT: the first call gets 401, refreshes once, retries and succeeds - no redirect, no logout", async () => {
  const state = world();
  const { authApi } = loadApi();
  const user = await authApi.me();
  assert.equal(user.id, "u1");
  assert.equal(state.refreshCalls, 1);
  assert.equal(state.assigned, 0, "no navigation to /login");
  assert.deepEqual(state.removed, [], "the persisted sign-in is untouched");
  assert.deepEqual(state.log.map((l) => l.replace(/ cookie=.*/, "")), ["GET /api/v1/auth/me", "POST /api/v1/auth/refresh", "GET /api/v1/auth/me"]);
});

test("a page that fires several calls at once refreshes ONCE (the refresh token rotates)", async () => {
  const state = world();
  const { authApi } = loadApi();
  const answers = await Promise.all([authApi.me(), authApi.me(), authApi.me(), authApi.me()]);
  assert.equal(state.refreshCalls, 1, "parallel refreshes would burn the rotated token and sign the user out");
  assert.ok(answers.every((a) => a && a.id === "u1"));
  assert.equal(state.assigned, 0);
  assert.deepEqual(state.removed, []);
  // a later 401 starts a new refresh (nothing stays cached)
  state.cookie = "stale";
  state.refreshToken = "r1";
  await authApi.me();
  assert.equal(state.refreshCalls, 2);
});

test("SessionSync's check (authApi.me then sessionVerdict) never mistakes a refreshed session for another user", async () => {
  world();
  const { authApi } = loadApi();
  const tabUser = { id: "u1", role: "owner", org_role: "owner" };
  const me = await authApi.me();
  const outcome = me && me.id ? { ok: true, user: me } : { ok: false, status: 401 };
  assert.deepEqual(S.sessionVerdict(tabUser, outcome), { action: "none" });
});

test("the refresh runs under a cross-tab Web Lock when the browser has one", async () => {
  const held = [];
  let busy = false;
  const locks = {
    request: async (name, callback) => {
      held.push(name);
      assert.equal(busy, false, "two refreshes inside the lock at once");
      busy = true;
      try { return await callback(); } finally { busy = false; }
    },
  };
  const state = world({ locks });
  const { authApi } = loadApi();
  await Promise.all([authApi.me(), authApi.me()]);
  assert.deepEqual(held, ["algo-auth-refresh"]);
  assert.equal(state.refreshCalls, 1);
});

test("refresh refused (revoked or 30 days gone): to /login, persisted sign-in dropped, nothing thrown", async () => {
  const state = world({ refreshWorks: false });
  const { authApi } = loadApi();
  const answer = await authApi.me();
  assert.equal(answer, undefined);
  assert.equal(state.locationHref, "/login");
  assert.deepEqual(state.removed, ["algo-auth"]);
  assert.equal(state.refreshCalls, 1);
});

test("after a good refresh, a refusal of the request itself (403) is an error, not a lost session", async () => {
  const state = world({ otherStatus: 403 });
  const { authApi } = loadApi();
  await assert.rejects(authApi.me(), (error) => error.status === 403 && error.message === "Нельзя");
  assert.equal(state.assigned, 0, "403 after a refresh must not send the user to /login");
  assert.deepEqual(state.removed, []);
});

test("no window (server render): no refresh is attempted", async () => {
  const state = world();
  delete global.window;
  const { authApi } = loadApi();
  const result = await authApi.me().catch((error) => error);
  assert.equal(state.refreshCalls, 0);
  assert.ok(result === undefined || result.status === 401 || result instanceof Error);
});

test("logout does not depend on a fresh JWT: the API route clears the cookies itself", () => {
  // The call is a plain POST; the server answers 200 and deletes both cookies even for a stale access token.
  const api = read("src/lib/api.ts");
  assert.match(api, /logout: \(\) =>\s*api<\{ message: string \}>\("\/auth\/logout", \{ method: "POST" \}\)/);
});

test.after(() => {
  delete global.window;
  delete global.fetch;
  delete global.localStorage;
  delete globalThis.navigator;
});
