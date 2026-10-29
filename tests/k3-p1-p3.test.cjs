// K3 P1-P3 (front): ONE image on any domain, the demo form moved to the landing, the product closed to search engines.
//   P1  an empty NEXT_PUBLIC_*_API_URL is the site the page was opened from (not localhost), SSR keeps the old fallback
//   P2  /request-demo, /register, onboarding form deleted; the phone mask and the validation live in a portable module;
//       «Запросить демо» and the old addresses lead to SITE_URL/#demo (a build variable, empty = this origin)
//   P3  robots.txt of the product «Disallow: /», noindex on /d/ /diagnostic/ /e/ /invite/ /set-password/
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
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const load = (rel) => { const f = path.join(root, rel); delete require.cache[f]; return require(f); };
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
function walk(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : /\.(tsx?|ts)$/.test(e.name) ? [rel] : [];
  });
}

// ---- P1: the address of the API ---------------------------------------------------------------------------------

test("P1: an empty address is the origin of the page in a browser, the old fallback on the server", () => {
  const { serviceOrigin, serviceApiV1 } = load("src/lib/api-base.ts");
  for (const origin of ["https://algolab.me", "https://app.algolab.me", "https://stage.algolab.me"]) {
    for (const empty of ["", undefined, null, "   "]) {
      assert.equal(serviceApiV1(empty, "http://localhost:8000", origin), `${origin}/api/v1`, `${origin} / ${JSON.stringify(empty)}`);
    }
  }
  // no page (SSR / node): nothing to take the origin from -> the old default, as before
  assert.equal(serviceApiV1("", "http://localhost:8000", null), "http://localhost:8000/api/v1");
  assert.equal(serviceApiV1(undefined, "http://localhost:8003", null), "http://localhost:8003/api/v1");
  // a configured address always wins (a local stack, the e2e harness, an old image with a full URL), a trailing slash is dropped
  assert.equal(serviceApiV1("http://localhost:18000", "http://localhost:8000", "https://app.algolab.me"), "http://localhost:18000/api/v1");
  assert.equal(serviceApiV1("https://algolab.me/", "http://localhost:8000", "https://app.algolab.me"), "https://algolab.me/api/v1");
  // the origin of a page is read at call time from window, not from a module constant
  const { browserOrigin } = load("src/lib/api-base.ts");
  assert.equal(browserOrigin(), null, "node: no window");
  global.window = { location: { origin: "https://stage.algolab.me" } };
  try {
    assert.equal(browserOrigin(), "https://stage.algolab.me");
    global.window = { location: { origin: "null" } }; // an opaque origin is no origin
    assert.equal(browserOrigin(), null);
    global.window = { location: {} }; // a stub without origin (older tests)
    assert.equal(browserOrigin(), null);
  } finally {
    delete global.window;
  }
});

test("P1: ONE bundle serves three domains: the same module, loaded in a browser of each host, calls that host", async () => {
  const saved = { auth: process.env.NEXT_PUBLIC_AUTH_API_URL, exam: process.env.NEXT_PUBLIC_EXAM_API_URL, diag: process.env.NEXT_PUBLIC_DIAG_API_URL };
  for (const key of ["NEXT_PUBLIC_AUTH_API_URL", "NEXT_PUBLIC_EXAM_API_URL", "NEXT_PUBLIC_DIAG_API_URL"]) process.env[key] = "";
  const seen = [];
  global.fetch = async (url) => {
    seen.push(String(url));
    return { ok: true, status: 200, json: async () => ({ id: "u1" }), text: async () => "{}" };
  };
  global.localStorage = { removeItem() {}, getItem: () => null, setItem() {} };
  try {
    for (const origin of ["https://algolab.me", "https://app.algolab.me", "https://stage.algolab.me"]) {
      global.window = { location: { origin, pathname: "/login", search: "" } };
      seen.length = 0;
      const { authApi, diagnosticApi, examsApi } = load("src/lib/api.ts");
      await authApi.me();
      await diagnosticApi.resolveSession("ABC").catch(() => {});
      await examsApi.getSummary("e1").catch(() => {});
      assert.equal(seen.length, 3, origin);
      assert.ok(seen[0].startsWith(`${origin}/api/v1/auth/me`), seen[0]);
      assert.ok(seen[1].startsWith(`${origin}/api/v1/diagnostic/`), seen[1]);
      assert.ok(seen[2].startsWith(`${origin}/api/v1/exams/`), seen[2]);
      const onboarding = load("src/lib/onboarding-api.ts");
      assert.equal(onboarding.AUTH_API_BASE, `${origin}/api/v1`);
    }
    // the server (no window): the old default of the service
    delete global.window;
    assert.equal(load("src/lib/onboarding-api.ts").AUTH_API_BASE, "http://localhost:8000/api/v1");
    // an explicit address of a build is respected in a browser too
    process.env.NEXT_PUBLIC_AUTH_API_URL = "https://api.example.test";
    global.window = { location: { origin: "https://app.algolab.me", pathname: "/login", search: "" } };
    seen.length = 0;
    await load("src/lib/api.ts").authApi.me();
    assert.ok(seen[0].startsWith("https://api.example.test/api/v1/auth/me"), seen[0]);
  } finally {
    delete global.window;
    for (const [key, value] of [["NEXT_PUBLIC_AUTH_API_URL", saved.auth], ["NEXT_PUBLIC_EXAM_API_URL", saved.exam], ["NEXT_PUBLIC_DIAG_API_URL", saved.diag]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test("P1: no place of src still turns an empty address into localhost (api.ts, onboarding-api.ts, any other)", () => {
  for (const file of walk("src")) {
    const code = stripComments(read(file));
    assert.doesNotMatch(code, /NEXT_PUBLIC_(AUTH|EXAM|DIAG)_API_URL\s*\|\|/, `${file}: an empty API address must not fall to localhost`);
  }
  const api = read("src/lib/api.ts");
  for (const [name, port] of [["AUTH", 8000], ["EXAM", 8003], ["DIAG", 8002]]) {
    assert.ok(api.includes(`serviceApiV1(process.env.NEXT_PUBLIC_${name}_API_URL, "http://localhost:${port}")`), name);
  }
  assert.ok(read("src/lib/onboarding-api.ts").includes('serviceApiV1(process.env.NEXT_PUBLIC_AUTH_API_URL, "http://localhost:8000")'));
  // the content address is server-side only (figures proxy, SSR): it never reaches a browser as an API base, so it keeps its rule
  const others = walk("src").filter((f) => /localhost/.test(stripComments(read(f))));
  assert.deepEqual(others.sort(), ["src/app/api/v1/figures/[...path]/route.ts", "src/lib/api.ts", "src/lib/figures.ts", "src/lib/onboarding-api.ts"].sort());
  // the image receives no API address: the Dockerfile defaults are empty, and the site address is a build argument
  const docker = read("Dockerfile");
  for (const name of ["AUTH_API_URL", "EXAM_API_URL", "DIAG_API_URL", "SITE_URL"]) assert.match(docker, new RegExp(`ARG NEXT_PUBLIC_${name}=""`), name);
});

// ---- P2: the demo form is gone, its logic is portable -----------------------------------------------------------

test("P2: the pages and files of the old demo form are deleted; set-password stays", () => {
  for (const gone of ["src/app/register", "src/app/request-demo", "src/components/onboarding/demo-request-page.tsx", "src/lib/demo-request.ts"]) {
    assert.equal(fs.existsSync(path.join(root, gone)), false, gone);
  }
  for (const kept of ["src/app/set-password/[token]/page.tsx", "src/components/onboarding/set-password-page.tsx", "src/components/onboarding/onboarding-shell.tsx", "src/lib/onboarding-api.ts"]) {
    assert.equal(fs.existsSync(path.join(root, kept)), true, kept);
  }
  assert.doesNotMatch(read("src/lib/onboarding-api.ts"), /submitDemoRequest|DemoRequestBody/);
});

test("P2: the portable module has no import and nothing of Next, React or the browser (the landing copies the file as is)", () => {
  const source = read("src/lib/portable/demo-form.ts");
  const code = stripComments(source);
  assert.doesNotMatch(code, /^\s*import\s/m, "no import");
  assert.doesNotMatch(code, /\brequire\(|from\s+["']/, "no dependency of any kind");
  assert.doesNotMatch(code, /\bwindow\b|\bdocument\b|\bprocess\b|\blocalStorage\b|next\/|react/, "no environment");
  // everything the form needs is exported from this ONE file
  const M = load("src/lib/portable/demo-form.ts");
  for (const name of ["formatUzPhone", "isValidUzPhone", "maskPhone", "phoneForServer", "isValidEmail", "validateDemoForm", "buildDemoBody", "captureSource", "sourceQuery", "classifyDemoFailure", "retryText", "EMPTY_DEMO_FORM", "COMMENT_MAX", "STUDENTS_MAX", "SUCCESS_STEPS"]) {
    assert.ok(name in M, name);
  }
  // it runs on its own: evaluated in an empty sandbox with nothing but `exports`
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const sandbox = { exports: {} };
  new Function("exports", compiled)(sandbox.exports);
  assert.equal(sandbox.exports.maskPhone("901234567"), "+998 90 123 45 67");
});

test("P2: the product keeps ONE copy of the phone mask, the portable one", () => {
  const phone = require(path.join(root, "src/lib/phone.ts"));
  const M = require(path.join(root, "src/lib/portable/demo-form.ts"));
  assert.equal(phone.formatUzPhone, M.formatUzPhone);
  assert.equal(phone.isValidUzPhone, M.isValidUzPhone);
  assert.equal(phone.displayPhone("998901234567"), "+998 90 123 45 67");
  assert.equal(phone.telHref("+998 90 123 45 67"), "tel:+998901234567");
  assert.equal(load("src/lib/http-json.ts").retryText, M.retryText);
  for (const file of walk("src")) {
    if (file === "src/lib/portable/demo-form.ts") continue;
    assert.doesNotMatch(stripComments(read(file)), /function\s+(formatUzPhone|isValidUzPhone|maskPhone|retryText)\b/, `${file}: a second copy of the logic`);
  }
});

test("P2: the failure of the server is read by shape, not by class: the landing's own client error fits", () => {
  const { classifyDemoFailure } = load("src/lib/portable/demo-form.ts");
  const landing = { status: 422, message: "x", fields: { contact_name: "Укажите имя", email: "Плохая почта" } };
  assert.deepEqual(classifyDemoFailure(landing).errors, { fullName: "Укажите имя", email: "Плохая почта" });
  assert.equal(classifyDemoFailure({ status: 0, message: "" }).kind, "network");
  assert.equal(classifyDemoFailure({ status: 429, message: "", retryAfter: 120 }).kind, "rate_limited");
  assert.equal(classifyDemoFailure({ status: 503, message: "" }).kind, "server");
  assert.equal(classifyDemoFailure(new Error("boom")).kind, "server");
  assert.equal(classifyDemoFailure(null).kind, "server");
});

test("P2: «Запросить демо» is SITE_URL/#demo; an empty variable is the same origin", () => {
  const { demoRequestUrl, siteBase } = load("src/lib/site-url.ts");
  assert.equal(demoRequestUrl("https://algolab.me"), "https://algolab.me/#demo");
  assert.equal(demoRequestUrl("https://algolab.me/"), "https://algolab.me/#demo", "no double slash");
  assert.equal(demoRequestUrl("https://landing.stage.algolab.me"), "https://landing.stage.algolab.me/#demo");
  for (const empty of ["", undefined, null, "  "]) assert.equal(demoRequestUrl(empty), "/#demo", JSON.stringify(empty));
  assert.equal(siteBase(undefined), "");
  // the campaign tags of an old link travel in front of the hash, nothing else does
  assert.equal(demoRequestUrl("https://algolab.me", "?utm_source=ig&utm_campaign=x&token=secret&email=a@b.c"), "https://algolab.me/?utm_source=ig&utm_campaign=x#demo");
  assert.equal(demoRequestUrl("", "?ref=p7"), "/?ref=p7#demo");
});

test("P2: the sign-in page takes the address from the build variable, nothing is hard-coded", () => {
  const login = read("src/app/login/page.tsx");
  assert.match(login, /const DEMO_REQUEST_URL = demoRequestUrl\(process\.env\.NEXT_PUBLIC_SITE_URL\);/);
  assert.match(login, /Нет доступа\?[\s\S]{0,200}<a href=\{DEMO_REQUEST_URL\}[^>]*>\s*Запросить демо\s*<\/a>/);
  for (const file of walk("src")) {
    assert.doesNotMatch(stripComments(read(file)), /https?:\/\/(www\.)?algolab\.me|landing\.stage/, `${file}: the address of the site is a build variable, not a literal`);
  }
  // rendered markup: the link of the owner's footer is the variable's value
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const withSite = (value) => {
    if (value === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = value;
    const Page = load("src/app/login/page.tsx").default;
    return renderToStaticMarkup(React.createElement(Page));
  };
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  const linkOf = (html) => (html.match(/<a href="([^"]*)"[^>]*>\s*Запросить демо/) || [])[1];
  try {
    // the sign-in opens on the owner's tab: its footer carries the link
    assert.equal(linkOf(withSite("https://algolab.me")), "https://algolab.me/#demo");
    assert.equal(linkOf(withSite("https://landing.stage.algolab.me/")), "https://landing.stage.algolab.me/#demo");
    assert.equal(linkOf(withSite("")), "/#demo");
    assert.equal(linkOf(withSite(undefined)), "/#demo");
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});

test("P2: /request-demo and /register redirect (302, not 404) to SITE_URL/#demo; tags travel, tokens do not", () => {
  const { NextRequest } = require("next/server");
  const visit = (url, site) => {
    if (site === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = site;
    return load("src/middleware.ts").middleware(new NextRequest(`https://app.algolab.me${url}`));
  };
  const saved = process.env.NEXT_PUBLIC_SITE_URL;
  try {
    for (const url of ["/request-demo", "/request-demo/", "/register"]) {
      const res = visit(url, "https://algolab.me");
      assert.equal(res.status, 302, url);
      assert.equal(res.headers.get("location"), "https://algolab.me/#demo", url);
    }
    const tagged = visit("/register?utm_source=ig&utm_campaign=autumn&token=nope&email=a@b.c", "https://algolab.me");
    assert.equal(tagged.headers.get("location"), "https://algolab.me/?utm_source=ig&utm_campaign=autumn#demo");
    assert.equal(visit("/request-demo?ref=p7", "https://landing.stage.algolab.me").headers.get("location"), "https://landing.stage.algolab.me/?ref=p7#demo");
    // empty variable: the same origin (no loop: `/` is not a legacy path)
    const same = visit("/request-demo", "");
    assert.equal(same.status, 302);
    assert.equal(new URL(same.headers.get("location")).href, "https://app.algolab.me/#demo");
    assert.equal(visit("/", undefined).status, 200);
    // the neighbours are untouched
    for (const url of ["/request-demonstration", "/registers", "/owner/register"]) assert.notEqual(visit(url, "https://algolab.me").headers.get("location"), "https://algolab.me/#demo", url);
  } finally {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SITE_URL; else process.env.NEXT_PUBLIC_SITE_URL = saved;
  }
});

// ---- P3: the product is closed to search engines ----------------------------------------------------------------

test("P3: robots.txt of the product is «Disallow: /» for everyone", () => {
  const robots = load("src/app/robots.ts").default();
  assert.deepEqual(robots.rules, { userAgent: "*", disallow: "/" });
  assert.equal(robots.sitemap, undefined);
  // the middleware lets /robots.txt through without a session
  const { NextRequest } = require("next/server");
  assert.equal(load("src/middleware.ts").middleware(new NextRequest("https://app.algolab.me/robots.txt")).status, 200);
  assert.equal(fs.existsSync(path.join(root, "public/robots.txt")), false, "one source: app/robots.ts");
});

test("P3: noindex on /d/, /diagnostic/, /e/, /invite/, /set-password/ (a layout with the metadata)", () => {
  const { NOINDEX } = load("src/lib/noindex.ts");
  assert.deepEqual(NOINDEX, { robots: { index: false, follow: false } });
  for (const dir of ["d", "diagnostic", "e", "invite", "set-password"]) {
    const layout = load(`src/app/${dir}/layout.tsx`);
    assert.deepEqual(layout.metadata, NOINDEX, dir);
    assert.equal(layout.default({ children: "child" }), "child", `${dir}: the layout only passes the page through`);
    assert.doesNotMatch(read(`src/app/${dir}/layout.tsx`), /use client/, `${dir}: metadata needs a server component`);
  }
  // a page of those branches never turns indexing back on
  for (const file of walk("src/app").filter((f) => /^src\/app\/(d|diagnostic|e|invite|set-password)\//.test(f))) {
    assert.doesNotMatch(stripComments(read(file)), /robots\s*:\s*\{\s*index\s*:\s*true/, file);
  }
});
