// Wave E / package E-A (front): «one rule - one implementation».  Each block is one decision of the lead (WAVE_E_SPEC.md):
//  5. one `newIdempotencyKey` (UUID v4 always, also without `crypto.randomUUID`);
//  6. one library of dates; 2. one registry of exam statuses; 1. the e-mail of an admin / teacher is read-only; 4. reasons by kind + the password rule; 7. the rest of DUP.
// MUTATIONS: the old behaviour is put back into a copy of the source and the same scenarios must fail.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");
const Module = require("node:module");

const root = path.join(__dirname, "..");
const transpile = (source) => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX },
}).outputText;
require.extensions[".ts"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
require.extensions[".tsx"] = (mod, filename) => mod._compile(transpile(fs.readFileSync(filename, "utf8")), filename);
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {                              // the "@/" alias of the app
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const lib = (name) => require(path.join(root, "src/lib", name));

/** A module loaded from a MUTATED copy of its source (sibling imports still resolve from the real folder). */
function loadMutated(file, from, to) {
  const source = read(file);
  assert.ok(source.includes(from), `mutation target not found in ${file}: ${from}`);
  const filename = path.join(root, file);
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(transpile(source.replace(from, to)), filename);
  return mod.exports;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(rel);
  }
  return out;
}
const SRC = walk("src");

/** Runs `fn` with `globalThis.crypto` replaced; the real one is put back afterwards. */
function withCrypto(replacement, fn) {
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  Object.defineProperty(globalThis, "crypto", { value: replacement, configurable: true, writable: true });
  try { return fn(); } finally {
    if (saved) Object.defineProperty(globalThis, "crypto", saved); else delete globalThis.crypto;
  }
}

// ---- decision 5: ONE idempotency key, always a UUID v4 -----------------------------------------------------------------------

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("E4/5: the key is a UUID v4 in EVERY environment (no randomUUID, throwing randomUUID, no crypto at all)", () => {
  const { newIdempotencyKey } = lib("idempotency-key.ts");
  const environments = {
    "modern": undefined,
    "no crypto.randomUUID (Safari < 15.4, insecure context)": { getRandomValues: (b) => { for (let i = 0; i < b.length; i += 1) b[i] = (i * 37 + 11) & 255; return b; } },
    "randomUUID throws": { randomUUID() { throw new Error("insecure"); } },
    "randomUUID returns not a uuid": { randomUUID: () => "not-a-uuid" },
    "no crypto at all": null,
    "crypto without any method": {},
  };
  for (const [name, replacement] of Object.entries(environments)) {
    const run = () => Array.from({ length: 30 }, () => newIdempotencyKey());
    const keys = replacement === undefined ? run() : withCrypto(replacement, run);
    for (const key of keys) assert.match(key, UUID_V4, `${name}: ${key}`);
    if (name !== "no crypto.randomUUID (Safari < 15.4, insecure context)") assert.equal(new Set(keys).size, 30, `${name}: keys differ`);
  }
});

test("E4/5: the old fallback «hex-rand-rand» is NOT a uuid - the scenario fails on it (mutation)", () => {
  const old = loadMutated("src/lib/idempotency-key.ts", "  const bytes = randomBytes();",
    "  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-${Math.random().toString(16).slice(2)}`;\n  const bytes = randomBytes();");
  const key = withCrypto({}, () => old.newIdempotencyKey());
  assert.doesNotMatch(key, UUID_V4);
});

test("E4/5: there is ONE key function - payments, payouts, pauses, openings and support all import it; no other randomUUID in src/", () => {
  const withRandomUuid = SRC.filter((f) => /\brandomUUID\b/.test(read(f).split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n")));
  assert.deepEqual(withRandomUuid, ["src/lib/idempotency-key.ts"]);
  for (const f of SRC) {
    const source = read(f);
    if (f === "src/lib/idempotency-key.ts") continue;
    assert.doesNotMatch(source, /function newIdempotencyKey|const newKey\b|function newClientKey|\bnewClientKey\b/, f);
  }
  for (const f of [
    "src/components/payments/payment-dialog.tsx", "src/components/payments/pause-dialog.tsx", "src/components/payroll/payout-dialog.tsx",
    "src/components/payments/openings-page.tsx", "src/components/support/support-dialog.tsx",
  ]) assert.match(read(f), /import \{ newIdempotencyKey \} from "@\/lib\/idempotency-key";/, f);
});
