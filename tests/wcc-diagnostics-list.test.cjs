// WC-C / PERF-2: the administrator's diagnostics list — the pages in parallel batches, the 15 s refresh on the first page only.
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
const { loadAllPages, mergeFirstPage, refreshKind, FULL_REFRESH_MS, PAGE_CONCURRENCY } = require(path.join(__dirname, "../src/lib/diagnostics-list.ts"));

const idOf = (item) => String(item.id);

/** A fake auth-service: `n` invites, newest first, `cap` = the page size the server really answers with. */
function fakeServer(n, cap = 100) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `inv-${n - i}`, status: i % 3 === 0 ? "completed" : "pending" }));
  const log = [];
  return {
    rows,
    log,
    fetch: async (offset) => {
      log.push(offset);
      const limit = Math.min(100, cap);
      return { items: rows.slice(offset, offset + limit), total: rows.length, limit, offset };
    },
  };
}

/** The former reading, copied from api.ts: the pages one after another. */
async function formerList(fetchPage) {
  const all = [];
  let offset = 0;
  while (true) {
    const response = await fetchPage(offset);
    if (Array.isArray(response)) return response;
    const pageItems = Array.isArray(response.items) ? response.items : [];
    all.push(...pageItems);
    offset += pageItems.length;
    if (offset >= response.total || pageItems.length === 0) return all;
  }
}

test("the list is the same as the sequential reading, whatever the size (0, 1, 100, 101, 250, 3000) and the server's page cap", async () => {
  for (const n of [0, 1, 99, 100, 101, 250, 399, 3000]) {
    for (const cap of [100, 50, 7]) {
      if (cap === 7 && n > 400) continue;
      const a = fakeServer(n, cap), b = fakeServer(n, cap);
      const former = await formerList(a.fetch);
      const now = await loadAllPages(b.fetch, idOf);
      assert.deepEqual(now, former, `n=${n} cap=${cap}`);
      assert.equal(now.length, n);
      assert.equal(b.log.length, a.log.length, `same number of requests n=${n} cap=${cap}`);
    }
  }
});

test("pages after the first go in batches of 4, in order; the rounds of waiting: 30 -> 8 for 3000 invites", async () => {
  const s = fakeServer(3000);
  let active = 0, maxActive = 0, rounds = 0;
  const fetchPage = async (offset) => {
    if (active === 0) rounds += 1;
    active += 1; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setImmediate(resolve));
    active -= 1;
    return s.fetch(offset);
  };
  const list = await loadAllPages(fetchPage, idOf);
  assert.equal(list.length, 3000);
  assert.equal(PAGE_CONCURRENCY, 4);
  assert.equal(maxActive, 4);
  assert.equal(rounds, 1 + Math.ceil(29 / 4), "1 + 8 batches of waiting (the former reading: 30 sequential)");
  assert.deepEqual(s.log.slice(0, 5), [0, 100, 200, 300, 400]);
  assert.equal(s.log.length, 30);
});

test("an old array answer (rolling update) is returned as it is; a failing page fails the whole read; an empty page ends it", async () => {
  const legacy = [{ id: "a" }, { id: "b" }];
  assert.deepEqual(await loadAllPages(async () => legacy, idOf), legacy);
  const s = fakeServer(450);
  await assert.rejects(() => loadAllPages(async (offset) => { if (offset === 200) throw new Error("503"); return s.fetch(offset); }, idOf), /503/);
  // the server says total 500 but runs dry: no endless loop
  const dry = async (offset) => ({ items: offset === 0 ? s.rows.slice(0, 100) : [], total: 500 });
  assert.equal((await loadAllPages(dry, idOf)).length, 100);
});

test("an invite created while the pages are read shifts the offsets: nobody is listed twice", async () => {
  const s = fakeServer(250);
  let calls = 0;
  const fetchPage = async (offset) => {
    calls += 1;
    if (calls === 2) s.rows.unshift({ id: "inv-new", status: "pending" });   // between the first batch's pages
    return { items: s.rows.slice(offset, offset + 100), total: s.rows.length };
  };
  const list = await loadAllPages(fetchPage, idOf);
  assert.equal(new Set(list.map(idOf)).size, list.length);
});

test("the first page laid over the list in hand equals the full list when only the newest invites changed", async () => {
  const s = fakeServer(250);
  const held = await loadAllPages(s.fetch, idOf);
  s.rows.unshift({ id: "inv-new2", status: "pending" }, { id: "inv-new1", status: "pending" });
  s.rows[5] = { ...s.rows[5], status: "in_progress" };
  const head = await s.fetch(0);
  const merged = mergeFirstPage(held, head.items, head.total, idOf);
  assert.deepEqual(merged, await formerList(s.fetch), "same list as a full read");
});

test("the first page holds the whole list: it IS the list (an invite that vanished is gone)", () => {
  const held = [{ id: "c" }, { id: "b" }, { id: "a" }];
  assert.deepEqual(mergeFirstPage(held, [{ id: "c" }, { id: "a" }], 2, idOf), [{ id: "c" }, { id: "a" }]);
  assert.deepEqual(mergeFirstPage([], [], 0, idOf), []);
});

test("a change of an old invite (beyond the first page) comes with the next whole read, at most 2 minutes later", () => {
  assert.equal(refreshKind(1000, null), "full", "at the opening");
  assert.equal(refreshKind(15_000, 0), "head");
  assert.equal(refreshKind(FULL_REFRESH_MS - 1, 0), "head");
  assert.equal(refreshKind(FULL_REFRESH_MS, 0), "full");
  assert.equal(FULL_REFRESH_MS, 120_000);
});

test("requests while the page is open (visible tab): before -> after, 60 s and 10 min", async (t) => {
  // before: opening + the whole list every 15 s.  after: opening (whole) + first page every 15 s + whole list every 2 minutes.
  const rows = [];
  for (const n of [50, 300, 3000]) {
    const pages = Math.max(1, Math.ceil(n / 100));
    for (const seconds of [60, 600]) {
      const ticks = Math.floor(seconds / 15);
      const before = (1 + ticks) * pages;
      let after = pages, lastFull = 0;
      for (let k = 1; k <= ticks; k += 1) {
        const now = k * 15_000;
        if (refreshKind(now, lastFull) === "full") { after += pages; lastFull = now; } else after += 1;
      }
      rows.push(`${n} invites, ${seconds} s: ${before} -> ${after}`);
      assert.ok(after <= before);
      if (n <= 100) assert.equal(after, before, "a centre of up to 100 invites: unchanged");
    }
  }
  t.diagnostic(rows.join(" | "));
  const text = rows.join("\n");
  assert.match(text, /3000 invites, 60 s: 150 -> 34/);
  assert.match(text, /300 invites, 60 s: 15 -> 7/);
});

test("the page: the list goes through the helpers, one refresh at a time, the latest wins, a visible tab only", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/admin/diagnostics/page.tsx"), "utf8");
  assert.ok(/refreshKind\(Date\.now\(\), lastFullAt\.current\)/.test(src));
  assert.ok(/orgApi\.listDiagnosticsHead\(\)/.test(src) && /mergeFirstPage\(held, head\.items, head\.total/.test(src));
  assert.ok(/if \(automatic && inFlight\.current\) return;/.test(src));
  assert.ok(/loadSequence\.current\.isCurrent\(token\)/.test(src));
  assert.ok(/startVisiblePolling\(\(\) => \{ void loadInvites\(true\); \}, 15_000, browserVisiblePollEnv\(\)\)/.test(src));
  assert.ok(!/setInterval/.test(src) && !/addEventListener\("visibilitychange"/.test(src), "no hand-made timer");
  const api = fs.readFileSync(path.join(__dirname, "../src/lib/api.ts"), "utf8");
  assert.ok(!/while \(true\)[\s\S]{0,400}\/auth\/org\/diagnostics/.test(api), "the sequential page loop is gone");
  assert.ok(/loadAllPages<any>/.test(api));
});

// ── R3 B1/m3: a request that never answers must not block the refresh ────────────────────────────────────────────────────────────
const { withTimeLimit } = require(path.join(__dirname, "../src/lib/request-limit.ts"));

function fakeTimers() {
  let now = 0, seq = 0, timers = [];
  return {
    env: { setTimer: (fn, ms) => { const t = { id: ++seq, at: now + ms, fn }; timers.push(t); return t.id; }, clearTimer: (id) => { timers = timers.filter((t) => t.id !== id); } },
    pending: () => timers.length,
    advance: async (ms) => { now += ms; for (const t of timers.filter((x) => x.at <= now)) { timers = timers.filter((x) => x !== t); t.fn(); } for (let i = 0; i < 10; i += 1) await Promise.resolve(); },
  };
}

test("a request that never answers is aborted after 8 s and rejects; a quick one clears its timer", async () => {
  const f = fakeTimers();
  let seen = null;
  const hung = withTimeLimit(8000, (signal) => { seen = signal; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))); }, f.env);
  const outcome = hung.then(() => "ok", (e) => e.message);
  await f.advance(7999);
  assert.equal(seen.aborted, false);
  await f.advance(1);
  assert.equal(seen.aborted, true);
  assert.equal(await outcome, "aborted");
  assert.equal(f.pending(), 0);
  assert.equal(await withTimeLimit(8000, async () => 42, f.env), 42);
  assert.equal(f.pending(), 0, "the timer of a finished request is cleared");
});

test("a page of the list that hangs fails the whole read at once (no wait for the others), so the next refresh can start", async () => {
  const f = fakeTimers();
  const s = fakeServer(450);
  const fetchPage = (offset) => offset === 200
    ? withTimeLimit(8000, (signal) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))), f.env)
    : s.fetch(offset);
  const outcome = loadAllPages(fetchPage, idOf).then(() => "ok", (e) => e.message);
  await new Promise((resolve) => setImmediate(resolve));     // the first page and the first batch are on the way, the hanging page has its timer
  await f.advance(8000);
  assert.equal(await outcome, "aborted");
});

test("the page: every page of the list has the 8 s limit; a failed refresh in the background keeps the list on screen", () => {
  const api = fs.readFileSync(path.join(__dirname, "../src/lib/api.ts"), "utf8");
  assert.ok(/DIAGNOSTICS_REQUEST_LIMIT_MS = 8000/.test(api));
  assert.ok(/withTimeLimit\(DIAGNOSTICS_REQUEST_LIMIT_MS, \(signal\) => api<PagedResponse<any> \| any\[\]>\(`[^`]*`, \{ signal \}\)\)/.test(api));
  const src = fs.readFileSync(path.join(__dirname, "../src/app/admin/diagnostics/page.tsx"), "utf8");
  assert.ok(/if \(automatic && hasList\.current\) return;/.test(src));
  assert.ok(/hasList\.current = true;/.test(src));
});
