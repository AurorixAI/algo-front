// Nits pack N1 (#138): the right to money comes from the profile (`payments_access`), the summary is not probed without it.
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const root = path.join(__dirname, "..");
require.extensions[".ts"] = (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
  }).outputText, filename);
};
const { usePaymentsSummary, paymentsAccessFromProfile } = require(path.join(root, "src/lib/payments-summary.ts"));
const { useAuthStore } = require(path.join(root, "src/lib/store.ts"));

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const SUMMARY = { due: 4, expired: 1, active: 9, period_mode: "calendar" };
const profile = (extra = {}) => ({ id: "u1", email: "a@b.c", first_name: "A", last_name: "B", full_name: "A B", role: "admin", org_role: "admin", ...extra });
const signIn = (extra) => useAuthStore.setState({ user: profile(extra), isAuthenticated: true });

/** `routes`: url suffix -> handler; every request is recorded. */
async function withServer(routes, run) {
  const original = global.fetch;
  const calls = [];
  global.fetch = async (url) => {
    calls.push(String(url));
    for (const [suffix, handler] of Object.entries(routes)) {
      if (String(url).split("?")[0].endsWith(suffix)) return handler();
    }
    throw new Error(`unexpected request ${url}`);
  };
  try {
    return await run(calls);
  } finally {
    global.fetch = original;
  }
}
const summaryCalls = (calls) => calls.filter((url) => url.endsWith("/auth/org/payments/summary"));

test.beforeEach(() => {
  usePaymentsSummary.getState().reset();
  useAuthStore.setState({ user: null, isAuthenticated: false });
});

test("the profile answer is read strictly: only a boolean counts", () => {
  assert.equal(paymentsAccessFromProfile({ payments_access: true }), true);
  assert.equal(paymentsAccessFromProfile({ payments_access: false }), false);
  for (const odd of [undefined, null, "true", 1, 0, {}, []]) assert.equal(paymentsAccessFromProfile({ payments_access: odd }), null);
  assert.equal(paymentsAccessFromProfile({}), null);
  assert.equal(paymentsAccessFromProfile(null), null);
  assert.equal(paymentsAccessFromProfile(undefined), null);
});

test("payments_access false: no request at all, the state of «no money», however often it is asked (admin without the right, teacher)", async () => {
  signIn({ payments_access: false });
  await withServer({}, async (calls) => {
    await usePaymentsSummary.getState().refresh();
    await usePaymentsSummary.getState().refresh(true);
    await usePaymentsSummary.getState().refresh(true);
    const state = usePaymentsSummary.getState();
    assert.deepEqual([state.available, state.loaded, state.due, state.debtTotal], [false, true, 0, 0]);
    assert.equal(calls.length, 0, "not a single request (no 403 per page load)");
  });
});

test("payments_access true (owner, admin with the right): asked as before, one request, money available", async () => {
  signIn({ payments_access: true, role: "owner", org_role: "owner" });
  await withServer({ "/auth/org/payments/summary": () => reply(200, SUMMARY) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    const state = usePaymentsSummary.getState();
    assert.deepEqual([state.available, state.loaded, state.due, state.expired, state.active], [true, true, 4, 1, 9]);
    assert.equal(summaryCalls(calls).length, 1);
    await usePaymentsSummary.getState().refresh(); // within a second: skipped, as before
    assert.equal(summaryCalls(calls).length, 1);
  });
});

test("payments_access absent (an older server, a profile stored before the field): the old probe - 200 gives money, 403 and 404 remember the refusal", async () => {
  signIn(); // no field
  await withServer({ "/auth/org/payments/summary": () => reply(200, SUMMARY) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, true);
    assert.equal(summaryCalls(calls).length, 1);
  });
  for (const status of [403, 404]) {
    usePaymentsSummary.getState().reset();
    await withServer({ "/auth/org/payments/summary": () => reply(status, { detail: "no" }) }, async (calls) => {
      await usePaymentsSummary.getState().refresh(true);
      await usePaymentsSummary.getState().refresh(true);
      const state = usePaymentsSummary.getState();
      assert.deepEqual([state.available, state.loaded], [false, true]);
      assert.equal(summaryCalls(calls).length, 1, `${status} is remembered`);
      await usePaymentsSummary.getState().refresh(true, { recheck: true });
      assert.equal(summaryCalls(calls).length, 2, "the timer re-checks");
    });
  }
  // null (an explicit "unknown") behaves like absent
  usePaymentsSummary.getState().reset();
  signIn({ payments_access: null });
  await withServer({ "/auth/org/payments/summary": () => reply(200, SUMMARY) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(summaryCalls(calls).length, 1);
  });
});

test("the owner gives the right in the middle of a session: the timer re-reads the profile and the money appears; no probe until the profile says so", async () => {
  signIn({ payments_access: false });
  let granted = false;
  const routes = {
    "/auth/me": () => reply(200, profile({ payments_access: granted })),
    "/auth/org/payments/summary": () => reply(200, SUMMARY),
  };
  await withServer(routes, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, false);
    // the timer while the right is still missing: one profile read, no summary request
    await usePaymentsSummary.getState().refresh(false, { recheck: true });
    assert.equal(summaryCalls(calls).length, 0);
    assert.equal(calls.filter((url) => url.endsWith("/auth/me")).length, 1);
    assert.equal(usePaymentsSummary.getState().available, false);
    // the owner allows it; the next timer tick sees the new profile and asks for the summary
    granted = true;
    await usePaymentsSummary.getState().refresh(false, { recheck: true });
    assert.equal(summaryCalls(calls).length, 1);
    assert.equal(useAuthStore.getState().user.payments_access, true);
    assert.deepEqual([usePaymentsSummary.getState().available, usePaymentsSummary.getState().due], [true, 4]);
  });
});

test("the right is taken back: a profile with false hides what was shown, with no 403 round trip", async () => {
  signIn({ payments_access: true });
  await withServer({ "/auth/org/payments/summary": () => reply(200, SUMMARY) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, true);
    useAuthStore.setState({ user: profile({ payments_access: false }) }); // the profile was reloaded (page load)
    await usePaymentsSummary.getState().refresh(true);
    const state = usePaymentsSummary.getState();
    assert.deepEqual([state.available, state.loaded, state.due], [false, true, 0]);
    assert.equal(summaryCalls(calls).length, 1, "no new request");
  });
});

test("a profile that says true outranks a refusal remembered from the probe", async () => {
  signIn(); // old profile: probe
  let status = 403;
  await withServer({ "/auth/org/payments/summary": () => (status === 403 ? reply(403, {}) : reply(200, SUMMARY)) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, false);
    status = 200;
    useAuthStore.setState({ user: profile({ payments_access: true }) });
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, true);
    assert.equal(summaryCalls(calls).length, 2);
  });
});

test("another user signs in (logout resets): the new profile decides from scratch", async () => {
  signIn({ payments_access: true });
  await withServer({ "/auth/org/payments/summary": () => reply(200, SUMMARY) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    assert.equal(usePaymentsSummary.getState().available, true);
    usePaymentsSummary.getState().reset();
    useAuthStore.setState({ user: profile({ id: "u2", role: "teacher", org_role: "teacher", payments_access: false }) });
    await usePaymentsSummary.getState().refresh(true);
    const state = usePaymentsSummary.getState();
    assert.deepEqual([state.available, state.loaded, state.due], [false, true, 0]);
    assert.equal(summaryCalls(calls).length, 1, "nothing asked for the second user");
  });
});

test("a profile read that fails or ends the session on a recheck leaves the state of «no money»", async () => {
  signIn({ payments_access: false });
  await withServer({ "/auth/me": () => reply(503, {}) }, async (calls) => {
    await usePaymentsSummary.getState().refresh(true);
    await usePaymentsSummary.getState().refresh(false, { recheck: true });
    assert.equal(summaryCalls(calls).length, 0);
    assert.deepEqual([usePaymentsSummary.getState().available, usePaymentsSummary.getState().loaded], [false, true]);
  });
});

test("the demo build never asks (as before): the check of the profile comes after the demo guard", () => {
  const source = fs.readFileSync(path.join(root, "src/lib/payments-summary.ts"), "utf8");
  assert.ok(source.indexOf("if (DEMO_MODE)") < source.indexOf("paymentsAccessFromProfile(useAuthStore"));
  const script = `
    const fs = require("fs"), ts = require("typescript"), path = require("path");
    require.extensions[".ts"] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, "utf8"), { compilerOptions: { module: 1, target: 7, esModuleInterop: true } }).outputText, f);
    let requests = 0; global.fetch = async () => { requests += 1; throw new Error("no requests in demo"); };
    const { usePaymentsSummary } = require(path.join(${JSON.stringify(root)}, "src/lib/payments-summary.ts"));
    const { useAuthStore } = require(path.join(${JSON.stringify(root)}, "src/lib/store.ts"));
    useAuthStore.setState({ user: { payments_access: true } });
    usePaymentsSummary.getState().refresh(true).then(() => {
      const s = usePaymentsSummary.getState();
      console.log(JSON.stringify([requests, s.available, s.loaded]));
    });`;
  const run = spawnSync(process.execPath, ["-e", script], { cwd: root, env: { ...process.env, NEXT_PUBLIC_DEMO_MODE: "true" }, encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(run.stdout.trim().split("\n").pop(), "[0,false,true]");
});
