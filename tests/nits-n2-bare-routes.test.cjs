// Nits pack N2 (#139): the bare addresses of the workspaces lead to their home panel.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
const redirected = [];
const originalLoad = Module._load;
Module._load = function load(request, ...rest) {
  if (request === "next/navigation") return { redirect: (to) => { redirected.push(to); throw new Error(`NEXT_REDIRECT ${to}`); } };
  return originalLoad.call(this, request, ...rest);
};
require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, filename);
};
require.extensions[".tsx"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
};

for (const role of ["owner", "admin", "teacher"]) {
  test(`/${role} redirects to /${role}/dashboard`, () => {
    const page = require(path.join(root, `src/app/${role}/page.tsx`)).default;
    redirected.length = 0;
    assert.throws(() => page(), /NEXT_REDIRECT/);
    assert.deepEqual(redirected, [`/${role}/dashboard`]);
  });
}

test("the panel each bare address leads to exists, and a bare address is not a redirect loop", () => {
  for (const role of ["owner", "admin", "teacher"]) {
    assert.ok(fs.existsSync(path.join(root, `src/app/${role}/dashboard/page.tsx`)), role);
    assert.ok(!/redirect\("\/[a-z]+"\)/.test(fs.readFileSync(path.join(root, `src/app/${role}/dashboard/page.tsx`), "utf8")), role);
  }
});

test("a visitor without a session is sent to the sign-in with the bare address kept as `redirect` (middleware), for every role and with a trailing slash", () => {
  const { loginReturnTarget } = require(path.join(root, "src/lib/safe-redirect.ts"));
  for (const bare of ["/owner", "/admin", "/teacher"]) {
    assert.equal(loginReturnTarget(bare, ""), bare);
    // Next.js strips the trailing slash (308) before the page runs; the sign-in then returns to the bare address
    assert.equal(loginReturnTarget(`${bare}/`, "").replace(/\/$/, ""), bare);
  }
  const middleware = fs.readFileSync(path.join(root, "src/middleware.ts"), "utf8");
  assert.match(middleware, /"\/owner": \["owner", "superadmin"\]/);
  assert.doesNotMatch(middleware, /PUBLIC_PATHS = \[[^\]]*"\/(owner|admin|teacher)"/);
});
