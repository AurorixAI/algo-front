// K3 (A7, A8), console: the new fields of a demo request and of a centre are SHOWN (defect D2 of the stage e2e, 29.10).
// Words by one function each (orgTypeLabel of the platform, labels.ts), empty optional fields are not drawn, the warning
// «Эта почта уже есть в ALGO» stands above «Одобрить», letters that did not go are marked, the «Из заявки» block of a centre
// exists only when the server sent it AND the role has requests.view (LESSONS 51).
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
const navigation = { useRouter: () => ({ replace() {}, push() {} }), usePathname: () => "/requests/", useSearchParams: () => new URLSearchParams() };
const load = Module._load;
Module._load = function (request, ...rest) {
  if (request === "next/navigation") return navigation;
  return load.call(this, request, ...rest);
};
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) request = path.join(root, "src", request.slice(2));
  return resolveFilename.call(this, request, ...rest);
};
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const labels = require(path.join(root, "console/src/lib/labels.ts"));
const view = require(path.join(root, "console/src/lib/request-view.ts"));
const { RequestDetails } = require(path.join(root, "console/src/components/requests.tsx"));
const { CentreBody } = require(path.join(root, "console/src/components/centres.tsx"));
const { orgTypeLabel } = require(path.join(root, "src/lib/org-type.ts"));

const text = (html) => html.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const FULL = {
  id: "r1", contact_name: "Тест Тестов", centre_name: "Звезда", city: "Ташкент", phone: "+998900000000", email: "t@example.com",
  students_count: 120, status: "new", is_repeat: false, created_at: "2026-10-29T18:13:00Z", updated_at: "2026-10-29T18:13:00Z", handled_by: null, org_id: null,
  source: { utm_source: "instagram", utm_medium: "cpc", utm_campaign: "autumn", referrer: "https://t.me/x", landing: "/" },
  org_type: "private_school", address: "ул. Навои, 5", branches_count: 2, position: "director", preferred_contact_time: "после 18:00",
  needs: ["payments", "payroll"], current_tool: "excel", heard_from: "Другое: от знакомого", locale: "uz", consent_at: null,
  mail: { team: "sent", applicant: "sent" }, email_in_algo: false,
  comment: "Нужны отчёты\nпо оплатам", decline_reason: null, notes: [], history: [], same_email: [], org: null,
};
const BARE = {
  ...FULL, org_type: null, address: null, branches_count: null, position: null, preferred_contact_time: null, needs: [], current_tool: null,
  heard_from: null, locale: "ru", mail: null, comment: null, source: null,
};
const render = (data, final = false) => text(renderToStaticMarkup(React.createElement(RequestDetails, { data, final })));

test("words of the codes: one table each, an unknown code is never Latin letters", () => {
  assert.equal(orgTypeLabel("tutoring_center"), "Репетиторский центр");
  assert.equal(labels.positionLabel("director"), "Директор");
  assert.equal(labels.positionLabel("ceo"), null);
  assert.equal(labels.toolLabel("other_system"), "Другая система");
  assert.equal(labels.needsLabel(["payments", "attendance", "payroll", "diagnostics", "exams"]), "Оплаты и долги, Посещаемость, Зарплата учителей, Диагностика, Экзамены");
  assert.equal(labels.needsLabel(["payments", "bogus"]), "Оплаты и долги");
  assert.equal(labels.needsLabel(["bogus"]), null);
  assert.equal(labels.needsLabel([]), null);
  assert.equal(labels.needsLabel(null), null);
  assert.equal(labels.branchesLabel(0), "Филиалов нет");
  assert.equal(labels.branchesLabel(3), "3");
  assert.equal(labels.branchesLabel(null), null);
  assert.equal(labels.localeLabel("uz"), "Узбекский");
});

test("the platform's orgTypeLabel is the ONE function: the console does not keep its own table of types", () => {
  assert.doesNotMatch(read("console/src/lib/labels.ts"), /tutoring_center|Репетиторский/);
  assert.match(read("console/src/components/requests.tsx"), /import \{ orgTypeLabel \} from "@\/lib\/org-type"/);
  assert.match(read("console/src/components/centres.tsx"), /import \{ orgTypeLabel \} from "@\/lib\/org-type"/);
});

test("the six words of the form match the server's table (demo_request_choices) and the landing", () => {
  const expected = { owner: "Владелец", director: "Директор", admin: "Администратор", other: "Другое" };
  for (const [code, word] of Object.entries(expected)) assert.equal(labels.positionLabel(code), word);
  const tools = { excel: "Excel", notebook: "Тетрадь", other_system: "Другая система", none: "Ничего" };
  for (const [code, word] of Object.entries(tools)) assert.equal(labels.toolLabel(code), word);
});

test("a full request card: type, address, branches, position, time, needs, tools, source, comment — in words", () => {
  const t = render(FULL);
  for (const part of [
    "Должность Директор", "Удобное время после 18:00", "Язык заявки Узбекский",
    "Название Звезда", "Тип Частная школа", "Город Ташкент", "Адрес ул. Навои, 5", "Филиалы 2", "Учеников 120",
    "Задачи Оплаты и долги, Зарплата учителей", "Пользуются сейчас Excel", "Откуда узнали Другое: от знакомого", "Комментарий Нужны отчёты по оплатам",
    "utm_source instagram", "utm_medium cpc", "utm_campaign autumn", "Реферер https://t.me/x", "Страница входа /",
  ]) assert.ok(t.includes(part), `no «${part}» in: ${t}`);
  // no Latin codes of the contract on the screen
  for (const code of ["private_school", "director", "payments", "payroll", "excel"]) assert.ok(!t.includes(code), code);
  assert.doesNotMatch(t, /уже есть в ALGO/);
  assert.doesNotMatch(t, /не ушло/);
});

test("optional empty fields are not drawn: no row, no empty title, no «null» / «undefined» / dash", () => {
  const t = render(BARE);
  for (const gone of ["Должность", "Удобное время", "Язык заявки", "Тип", "Адрес", "Филиалы", "Что нужно центру", "Задачи", "Пользуются сейчас", "Откуда узнали", "Комментарий", "Источник / UTM", "null", "undefined"]) {
    assert.ok(!t.includes(gone), `«${gone}» must not be drawn: ${t}`);
  }
  assert.ok(t.includes("ФИО Тест Тестов") && t.includes("Название Звезда") && t.includes("Город Ташкент") && t.includes("Учеников 120"));
  // «0 branches» is an answer, not an empty field
  assert.ok(render({ ...BARE, branches_count: 0 }).includes("Филиалы Филиалов нет"));
  // an old server sends none of the K3 keys at all
  const old = { ...BARE }; for (const key of ["org_type", "address", "branches_count", "position", "preferred_contact_time", "needs", "current_tool", "heard_from", "locale", "mail", "email_in_algo"]) delete old[key];
  assert.ok(render(old).includes("ФИО Тест Тестов"));
});

test("«Эта почта уже есть в ALGO» stands first, above the applicant, only on an open request", () => {
  const html = renderToStaticMarkup(React.createElement(RequestDetails, { data: { ...FULL, email_in_algo: true }, final: false }));
  assert.match(html, /data-testid="email-in-algo"/);
  assert.match(text(html), /Эта почта уже есть в ALGO/);
  assert.ok(html.indexOf("email-in-algo") < html.indexOf("Заявитель"), "the warning is above the card");
  assert.doesNotMatch(render({ ...FULL, email_in_algo: true }, true), /уже есть в ALGO/);
  assert.doesNotMatch(render({ ...FULL, email_in_algo: false }), /уже есть в ALGO/);
  // and again in the approve dialog (the button is pressed there)
  assert.match(read("console/src/components/requests.tsx"), /request\.email_in_algo && email\.trim\(\)\.toLowerCase\(\) === request\.email\.toLowerCase\(\)/);
});

test("letters: «письмо команде не ушло», «заявителю: потолок», «не ушло»; sent / unknown draw nothing alarming", () => {
  assert.deepEqual(view.mailMarks(null), []);
  assert.deepEqual(view.mailMarks(undefined), []);
  assert.deepEqual(view.mailMarks({ team: "sent", applicant: "sent" }), []);
  assert.deepEqual(view.mailMarks({ team: null, applicant: null }), []);
  assert.deepEqual(view.mailProblems({ team: "failed", applicant: "cap" }).map((m) => m.short), ["письмо команде не ушло", "письмо заявителю: потолок"]);
  assert.deepEqual(view.mailProblems({ team: "sent", applicant: "failed" }).map((m) => m.short), ["письмо заявителю не ушло"]);
  assert.deepEqual(view.mailProblems({ team: "pending", applicant: "pending" }), [], "a letter on its way is not a problem");
  assert.match(render({ ...FULL, mail: { team: "failed", applicant: "cap" } }), /Письмо команде о новой заявке не ушло.*Письмо заявителю не отправлено: достигнут суточный потолок/);
  assert.match(render({ ...FULL, mail: { team: "sent", applicant: "failed" } }), /Письмо заявителю не ушло/);
  assert.match(render({ ...FULL, mail: { team: "pending", applicant: "sent" } }), /Письмо команде ещё отправляется/);
});

test("the list: type next to the city, pills for «почта уже в ALGO» and for a letter that did not go", () => {
  const src = read("console/src/components/requests.tsx");
  assert.match(src, /r\.org_type \? `\$\{r\.city\} · \$\{orgTypeLabel\(r\.org_type\)\}` : r\.city/);
  assert.match(src, /<RequestFlags request=\{r\} \/>/);
  assert.match(src, /request\.email_in_algo && <Pill tone="amber" className="whitespace-normal">почта уже в ALGO<\/Pill>/);
  assert.match(src, /mailProblems\(request\.mail\)/);
  // drawn through the real component too
  const { RequestFlags } = require(path.join(root, "console/src/components/requests.tsx"));
  const flags = (r) => text(renderToStaticMarkup(React.createElement(RequestFlags, { request: r })));
  assert.equal(flags({ ...FULL, mail: { team: "sent", applicant: "sent" }, email_in_algo: false }), "");
  assert.equal(flags({ ...FULL, mail: null }), "");
  assert.equal(flags({ ...FULL, mail: { team: "failed", applicant: "cap" }, email_in_algo: true }), "почта уже в ALGO письмо команде не ушло письмо заявителю: потолок");
});

const ORG = {
  id: "o1", name: "Звезда", city: "Ташкент", status: "active", blocked_at: null, plan: null, owner: { id: "u", name: "Тест Тестов", email: "t@example.com" },
  students: 10, teachers: 2, groups: 3, active_users_7d: 1, active_users_30d: 2, last_login_at: null, max_students: null, max_teachers: null, created_at: "2026-10-29T18:13:00Z",
  phone: "+998900000000", email: "t@example.com", address: "ул. Навои, 5", blocked_reason: null, members: [], history: [],
  usage_30d: { attendance_marks: 0, payments: 0, exams: 0, diagnostics: 0 }, org_type: "tutoring_center",
  request: { id: "r1", created_at: "2026-10-28T10:00:00Z", needs: ["attendance"], current_tool: "notebook", heard_from: "Instagram", branches_count: 0, position: "owner", preferred_contact_time: null },
};
const centre = (data, canViewRequest) => text(renderToStaticMarkup(React.createElement(CentreBody, { data, canManage: false, canViewRequest, onLimits() {} })));

test("a centre: type in words; «Из заявки» only with the block AND the right (role without requests.view gets none, LESSONS 51)", () => {
  const withBlock = centre(ORG, true);
  assert.ok(withBlock.includes("Тип Репетиторский центр"));
  for (const part of ["Из заявки", "Должность Владелец", "Задачи Посещаемость", "Пользуются сейчас Тетрадь", "Откуда узнали Instagram", "Филиалы Филиалов нет", "Открыть заявку"]) {
    assert.ok(withBlock.includes(part), `no «${part}»: ${withBlock}`);
  }
  assert.ok(!withBlock.includes("Удобное время"), "an empty answer is not drawn");
  // the server did not send the block (a role without requests.view): nothing, not even an empty title
  const { request, ...noKey } = ORG;
  assert.ok(!centre(noKey, false).includes("Из заявки"));
  assert.ok(!centre(noKey, true).includes("Из заявки"));
  // a centre created by hand has no source request: `request: null`
  assert.ok(!centre({ ...ORG, request: null }, true).includes("Из заявки"));
  // belt and braces: even if a block slipped into the answer, a role without the right does not see it
  assert.ok(!centre(ORG, false).includes("Из заявки"));
  assert.ok(!centre(ORG, false).includes("Посещаемость"));
  // a centre without a type (older server): «Не указан», never a Latin code
  assert.ok(centre({ ...ORG, org_type: undefined }, true).includes("Тип Не указан"));
  assert.ok(!withBlock.includes("tutoring_center"));
});

test("the right to see the block is asked from the session (requests.view), not from orgs.view", () => {
  const src = read("console/src/components/centres.tsx");
  assert.match(src, /canViewRequest=\{can\(me, "requests\.view"\)\}/);
});

test("phone 375: card values wrap (break-words), labels column is fixed, no wide table inside the card", () => {
  const bits = read("console/src/components/bits.tsx");
  assert.match(bits, /grid-cols-\[8\.5rem_1fr\]/);
  assert.match(bits, /min-w-0 break-words/);
  assert.match(bits, /whitespace-pre-wrap/);
});
