// SECURITY: the unauthenticated figure proxy accepts only /api/v1/figures/<uuid>/<image file>.
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
const F = require(path.join(root, "src/lib/figure-path.ts"));

const ID = "0a1b2c3d-4e5f-6789-abcd-ef0123456789";
const BASE = "http://algo-content:8004";

test("real figure shapes are accepted", () => {
  for (const file of ["fig-p12-3.png", "fig-p4-units.png", "fig-p7-2ab.png", "fig-p3-1-2.png", "fig-p5-girls.png", "a.b.jpeg", "X.JPG", "w.webp", "g.gif"]) {
    const p = F.parseFigurePath([ID, file]);
    assert.ok(p, file);
    assert.equal(p.pathname, `/api/v1/figures/${ID}/${file}`);
    assert.equal(F.buildFigureTargetUrl(BASE, [ID, file]), `${BASE}/api/v1/figures/${ID}/${file}`, file);
  }
});

test("upper-case UUID is accepted", () => {
  assert.ok(F.parseFigurePath([ID.toUpperCase(), "fig-p12-3.png"]));
});

test("traversal and encoded traversal are rejected", () => {
  const bad = [
    ["..", "version"],            // decoded from ..%2fversion would be a single segment "../version"
    ["../version"],
    [ID, "../version"],
    [ID, "..%2fversion"],
    ["%2e%2e", "version"],
    ["%252e%252e", "version"],    // decoded form of %252e%252e/version
    ["%2e%2e"],
    [ID, "%2e%2e"],
    [ID, "%2e%2e.png"],
    [ID, "a%2fb.png"],
    [ID, "..png"],
    [ID, "a/../b.png"],
  ];
  for (const segs of bad) {
    assert.equal(F.parseFigurePath(segs), null, JSON.stringify(segs));
    assert.equal(F.buildFigureTargetUrl(BASE, segs), null, JSON.stringify(segs));
  }
});

test("wrong segment count, bad uuid, bad file names are rejected", () => {
  const bad = [
    [], [ID], [ID, "a.png", "b.png"], ["a", ID, "a.png"],
    ["not-a-uuid", "a.png"], [ID.slice(1), "a.png"], [ID + "0", "a.png"], [`${ID}x`, "a.png"],
    [ID, ".png"], [ID, ".hidden.png"], [ID, "x.svg"], [ID, "x.png/"], [ID, "x.png "], [ID, "x.png\n"],
    [ID, "x"], [ID, "x.pdf"], [ID, "x.png?y=1"], [ID, "x.png#h"], [ID, "x\\y.png"],
    [ID, "рис.png"], [ID, "fig-é.png"], [ID, "a".repeat(300) + ".png"], [ID, "a".repeat(102) + ".png"],
    [ID, ""], ["", "a.png"], [ID, "x.p ng"], [ID, "a.png.svg"],
  ];
  for (const segs of bad) assert.equal(F.parseFigurePath(segs), null, JSON.stringify(segs));
  for (const v of [undefined, null, "a/b", 5, {}, [ID, 5]]) assert.equal(F.parseFigurePath(v), null, String(v));
});

test("a 100+extension name is the longest accepted", () => {
  assert.ok(F.parseFigurePath([ID, "a".repeat(101) + ".png"]));
});

test("only image content types are forwarded", () => {
  assert.equal(F.allowedImageContentType("image/png"), "image/png");
  assert.equal(F.allowedImageContentType("Image/JPEG; charset=binary"), "image/jpeg");
  assert.equal(F.allowedImageContentType("image/webp"), "image/webp");
  assert.equal(F.allowedImageContentType("image/gif"), "image/gif");
  for (const t of ["application/json", "text/html", "image/svg+xml", "", null, undefined, "image/png2"]) {
    assert.equal(F.allowedImageContentType(t), null, String(t));
  }
});

test("the route imports and uses the validator, timeout and nosniff", () => {
  const src = fs.readFileSync(path.join(root, "src/app/api/v1/figures/[...path]/route.ts"), "utf8");
  assert.match(src, /from "@\/lib\/figure-path"/);
  assert.match(src, /buildFigureTargetUrl\(backendUrl, params\.path\)/);
  assert.match(src, /status: 404/);
  assert.match(src, /allowedImageContentType\(/);
  assert.match(src, /X-Content-Type-Options": "nosniff"/);
  assert.match(src, /AbortController/);
  // the old unvalidated join must be gone
  assert.doesNotMatch(src, /params\.path\.join/);
  // validation happens before any fetch
  assert.ok(src.indexOf("buildFigureTargetUrl(") < src.indexOf("fetch("));
});
