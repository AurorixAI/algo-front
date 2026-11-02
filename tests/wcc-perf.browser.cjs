// WC-C: request counts and the waiting-room entry in a real (headless) browser against a local build, synthetic HTTP only.
//   QA_BASE=http://127.0.0.1:3310 node tests/wcc-perf.browser.cjs
// Scenarios: PERF-1 (sidebar badges over a walk through the administrator's pages), F-A14 (student's waiting room: calls per 20 s,
// back-off during a 503 outage, start -> entry time, return of the tab), PERF-2 (administrator's diagnostics list, 3000 invites).
const assert = require('node:assert/strict');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright');
const base = process.env.QA_BASE || 'http://127.0.0.1:3310';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(base).hostname), 'Use a local frontend: all HTTP data are synthetic.');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.env.WCC_ONLY ? process.env.WCC_ONLY.split(',') : ['perf1', 'fa14', 'perf2'];
const headers = {'access-control-allow-origin': base, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS'};
const json = (route, body, status = 200) => route.fulfill({status, headers, contentType: 'application/json', body: JSON.stringify(body)});

async function newContext(browser, handler) {
  const context = await browser.newContext({viewport: {width: 1280, height: 900}});
  await context.addCookies([{name: 'algo_auth_token', value: 'synthetic-render-only', url: base, httpOnly: true}]);
  await context.route('**/api/v1/**', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({status: 204, headers});
    return handler(route, new URL(route.request().url()));
  });
  return context;
}

const baseStaff = (role) => (path) => {
  if (path === '/api/v1/auth/me') return {id: 'UI-STAFF', role, org_role: role, first_name: 'Проверка', last_name: 'Отображения', org_id: 'UI-ORG'};
  if (path === '/api/v1/auth/org/attendance/excuses/summary') return {pending_total: 0, open_lessons_total: 0};
  if (path === '/api/v1/auth/org/substitutions/summary') return {pendingTotal: 0, urgentTotal: 0, overdueTotal: 0};
  if (path === '/api/v1/auth/org/payments/summary') return {as_of: '2026-10-14', due: 0, ends_today: 0, expired: 0, expiring: 0, none: 0, active: 0, free: 0, tracked_total: 0, period_mode: 'calendar'};
  if (path === '/api/v1/auth/org/attendance/open-actions') return [];
  if (path === '/api/v1/auth/support/unread') return {count: 0};
  return undefined;
};

async function perf1(browser, out) {
  const staff = baseStaff('admin');
  const counts = {excuses: 0, substitutions: 0};
  const context = await newContext(browser, (route, url) => {
    if (url.pathname === '/api/v1/auth/org/attendance/excuses/summary') counts.excuses += 1;
    if (url.pathname === '/api/v1/auth/org/substitutions/summary') counts.substitutions += 1;
    const body = staff(url.pathname);
    return body === undefined ? json(route, {}, 404) : json(route, body);
  });
  const page = await context.newPage();
  await page.goto(base + '/admin/diagnostics');
  await page.locator('a[href="/admin/groups"]').first().waitFor();
  await sleep(1500);
  const opening = {...counts};
  const hrefs = ['/admin/groups', '/admin/students', '/admin/exams', '/admin/teachers', '/admin/payments', '/admin/substitutions', '/admin/diagnostics', '/admin/groups', '/admin/students', '/admin/exams'];
  for (const href of hrefs) {
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForURL('**' + href);
    await sleep(1300);   // longer than the 1 s guard of the badge stores
  }
  out.perf1 = {opening, afterWalk: {...counts}, navigations: hrefs.length, extraAfterOpening: {excuses: counts.excuses - opening.excuses, substitutions: counts.substitutions - opening.substitutions}};
  await context.close();
}

function lobbyScenario(state) {
  const staff = baseStaff('teacher');
  const task = {task_id: 'T1', text: 'Сколько будет 2+2?', question_text: 'Сколько будет 2+2?', question_latex: 'Сколько будет $2+2$?', skill_name: 'Сложение', difficulty: 'easy', options: ['3', '4', '5'], options_latex: ['3', '4', '5'], task_type: 'multiple_choice', answer_type: 'multiple_choice'};
  return (route, url) => {
    const p = url.pathname;
    if (p.endsWith('/by-code/UI-LOBBY')) return json(route, {title: 'Лобби', teacher_name: 'Т', subject: 'Математика', status: 'lobby', total_time_minutes: 45, tasks_per_variant: 1, variants_count: 1, has_group: false});
    if (p.endsWith('/by-code/UI-LOBBY/start')) return json(route, {session_id: 'S1', session_token: 'tok', variant_number: 1, status: 'waiting', time_minutes: 45});
    if (p.includes('/session-status/')) {
      state.statusCalls.push(Date.now());
      if (state.mode === 'down') return json(route, {detail: 'busy'}, 503);
      if (state.mode === 'started') return json(route, {status: 'in_progress', variant_number: 1, time_minutes: 45, time_remaining_seconds: 2700, tasks: [task]});
      return json(route, {status: 'waiting'});
    }
    const body = staff(p);
    return body === undefined ? json(route, {}, 404) : json(route, body);
  };
}

async function fa14(browser, out) {
  const state = {mode: 'waiting', statusCalls: []};
  const context = await newContext(browser, lobbyScenario(state));
  const page = await context.newPage();
  await page.goto(base + '/e/UI-LOBBY');
  await page.getByPlaceholder('Иван Иванов').fill('Синтетический Ученик');
  await page.getByRole('button', {name: /Начать экзамен|Войти|Продолжить/}).first().click();
  await page.getByText(/Ожидание|ожида/i).first().waitFor({timeout: 10000});
  const result = {};
  // 1. healthy lobby: calls in 20 s (the interval of 1.5 s made 13)
  state.statusCalls.length = 0;
  await sleep(20_000);
  result.healthyCallsPer20s = state.statusCalls.length;
  // 2. outage: 20 s of 503 (the interval made 13)
  state.mode = 'down'; state.statusCalls.length = 0;
  await sleep(20_000);
  result.outageCallsPer20s = state.statusCalls.length;
  const gaps = state.statusCalls.slice(1).map((t, i) => t - state.statusCalls[i]);
  result.outageMaxGapMs = Math.max(...gaps);
  // 3. the server recovers and the exam starts at the worst moment: the student enters within 5 s
  const flipAt = Date.now(); state.mode = 'started';
  await page.getByText('Сколько будет').first().waitFor({timeout: 15_000});
  result.startToEntryMs = Date.now() - flipAt;
  assert.ok(result.startToEntryMs <= 5500, `entered after ${result.startToEntryMs} ms`);
  assert.ok(result.outageMaxGapMs <= 5600, `back-off ceiling: ${result.outageMaxGapMs} ms`);
  out.fa14 = result;
  await context.close();

  // 4. the tab returns: an ask at once (a hidden tab keeps polling at its own pace; the browser may slow it down)
  const state2 = {mode: 'waiting', statusCalls: []};
  const context2 = await newContext(browser, lobbyScenario(state2));
  const page2 = await context2.newPage();
  await page2.goto(base + '/e/UI-LOBBY');
  await page2.getByPlaceholder('Иван Иванов').fill('Синтетический Ученик');
  await page2.getByRole('button', {name: /Начать экзамен|Войти|Продолжить/}).first().click();
  await page2.getByText(/Ожидание|ожида/i).first().waitFor({timeout: 10000});
  await sleep(3000);
  state2.statusCalls.length = 0;
  // the exam starts while the tab is "hidden" and its timers do not run: the page cannot ask by itself; the return does
  await page2.evaluate(() => { window.__realSetTimeout = window.setTimeout; window.setTimeout = (fn, ms, ...a) => (ms >= 1000 && ms <= 5000 ? 0 : window.__realSetTimeout(fn, ms, ...a)); });
  await sleep(6000);
  state2.mode = 'started';
  const before = Date.now();
  await page2.evaluate(() => { window.dispatchEvent(new Event('focus')); });
  await page2.getByText('Сколько будет').first().waitFor({timeout: 5000});
  out.fa14.returnToEntryMs = Date.now() - before;
  await context2.close();
}

async function perf2(browser, out) {
  const total = 3000;
  const rows = Array.from({length: total}, (_, i) => ({id: `inv-${total - i}`, student_id: `st-${i}`, student_name: `Ученик ${i}`, class_level: 9, code: `C${total - i}`, status: i % 4 === 0 ? 'completed' : 'pending', diagnostic_type: 'initial', created_at: '2026-10-01T10:00:00', is_assigned: false, result: null}));
  const staff = baseStaff('admin');
  const calls = [];
  const context = await newContext(browser, (route, url) => {
    if (url.pathname === '/api/v1/auth/org/diagnostics') {
      const limit = Number(url.searchParams.get('limit') || 50), offset = Number(url.searchParams.get('offset') || 0);
      calls.push({t: Date.now(), offset});
      return json(route, {items: rows.slice(offset, offset + limit), total, limit, offset});
    }
    const body = staff(url.pathname);
    return body === undefined ? json(route, {}, 404) : json(route, body);
  });
  const page = await context.newPage();
  const started = Date.now();
  await page.goto(base + '/admin/diagnostics');
  await page.getByText('Ученик 5', {exact: false}).first().waitFor({timeout: 20000});
  const openedMs = Date.now() - started;
  const opening = calls.length;
  await sleep(60_000 - (Date.now() - started));
  out.perf2 = {invites: total, requestsOpening: opening, requestsIn60s: calls.length, openedMs};
  await context.close();
}

(async () => {
  const browser = await chromium.launch({...(process.env.CHROME_EXECUTABLE_PATH ? {executablePath: process.env.CHROME_EXECUTABLE_PATH} : {}), headless: true});
  const out = {};
  try {
    if (only.includes('perf1')) await perf1(browser, out);
    if (only.includes('fa14')) await fa14(browser, out);
    if (only.includes('perf2')) await perf2(browser, out);
  } finally {
    await browser.close();
  }
  console.log(JSON.stringify(out, null, 1));
})().catch((e) => { console.error(e); process.exit(1); });
