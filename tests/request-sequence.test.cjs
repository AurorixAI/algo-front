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
const { createRequestSequence } = require(path.join(__dirname, "../src/lib/request-sequence.ts"));

// Minimal model of the student-profile loader: each load takes a token, awaits a
// response we resolve by hand, and applies result + `loading=false` only if its
// token is still the latest (exactly what student-profile-view.tsx does).
function makeLoader() {
  const seq = createRequestSequence();
  const state = { shown: null, loading: false };
  const load = (student) => {
    const token = seq.next();
    state.loading = true;
    let resolve;
    const response = new Promise((r) => { resolve = r; });
    const done = response.then((data) => {
      if (seq.isCurrent(token)) state.shown = data;
    }).finally(() => {
      if (seq.isCurrent(token)) state.loading = false;
    });
    return { student, respond: (data) => { resolve(data); return done; } };
  };
  return { seq, state, load };
}

test("tokens are monotonically increasing and only the latest is current", () => {
  const seq = createRequestSequence();
  const a = seq.next();
  assert.equal(seq.isCurrent(a), true);
  const b = seq.next();
  assert.ok(b > a);
  assert.equal(seq.isCurrent(a), false);
  assert.equal(seq.isCurrent(b), true);
});

test("sequences are independent per instance", () => {
  const s1 = createRequestSequence();
  const s2 = createRequestSequence();
  const t1 = s1.next();
  s2.next();
  s2.next();
  assert.equal(s1.isCurrent(t1), true);
});

test("A -> B -> A: the first A response is stale and does not clear loading", async () => {
  const { state, load } = makeLoader();
  const a1 = load("A");
  const b = load("B");
  const a2 = load("A");
  await a1.respond("A-old");
  assert.equal(state.shown, null, "first A response is ignored");
  assert.equal(state.loading, true, "stale finally must not clear loading while the 2nd A is in flight");
  await b.respond("B");
  assert.equal(state.shown, null);
  assert.equal(state.loading, true);
  await a2.respond("A-new");
  assert.equal(state.shown, "A-new");
  assert.equal(state.loading, false);
});

test("latest wins even when the responses arrive in reverse order", async () => {
  const { state, load } = makeLoader();
  const first = load("A");
  const second = load("A");
  await second.respond("second");
  assert.equal(state.shown, "second");
  assert.equal(state.loading, false);
  await first.respond("first");
  assert.equal(state.shown, "second", "late older response must not overwrite the newer one");
  assert.equal(state.loading, false);
});

test("a retry superseded by a same-student reload is invalidated", () => {
  const seq = createRequestSequence();
  const retry = seq.next();      // retryExams started
  const reload = seq.next();     // loadProfile after handleSaveNotes / onAssigned
  assert.equal(seq.isCurrent(retry), false, "retry result must be dropped");
  assert.equal(seq.isCurrent(reload), true);
});

test("a reload superseded by a newer retry is invalidated; the retry stays current", () => {
  const seq = createRequestSequence();
  const reload = seq.next();
  const retry = seq.next();
  assert.equal(seq.isCurrent(reload), false);
  assert.equal(seq.isCurrent(retry), true);
});

test("a stale response settling after the latest one finished does not flip loading back", async () => {
  const { state, load } = makeLoader();
  const old = load("A");
  const latest = load("B");
  await latest.respond("B");
  assert.equal(state.loading, false);
  await old.respond("A");
  assert.equal(state.shown, "B");
  assert.equal(state.loading, false);
});
