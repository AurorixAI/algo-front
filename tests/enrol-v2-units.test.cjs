// Windows of enrolment by the owner's mock-up: the pure parts - the bar (the sum, ONE line made of the fields of the server's answer, the name of the button), the conditions line, the message of success.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const compile = (jsx) => (mod, filename) => {
  mod._compile(ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true, ...(jsx ? { jsx: ts.JsxEmit.ReactJSX } : {}) } }).outputText, filename);
};
require.extensions[".ts"] = compile(false);
require.extensions[".tsx"] = compile(true);
const Module = require("node:module");
const resolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) { return resolveFilename.call(this, request.startsWith("@/") ? path.join(__dirname, "..", "src", request.slice(2)) : request, ...rest); };
const root = path.join(__dirname, "..");
const B = require(path.join(root, "src/lib/enrol-bar.ts"));
const T = require(path.join(root, "src/lib/enrol-terms.ts"));
const E = require(path.join(root, "src/lib/group-enrol.ts"));
const flat = (text) => String(text).replace(/ /g, " ");

const nov = (amount, lessons = 5, inPeriod = 12, extra = {}) => ({ label: "ноябрь", from: "2026-11-19", amount, lessons, lessons_in_period: inPeriod, whole: false, ...extra });
const row = (id, name, amount, parts) => ({ id, name, amount, parts: parts ?? (amount === null ? [] : [nov(amount)]) });

test("the bar: one student - the lessons only; all the same - «по … · …»; some pay - the count in the dative; one of several - his name", () => {
  const one = B.enrolBarOf([row("a", "Анвар", 188000)]);
  assert.equal(flat(one.totalText), "188 000"); assert.equal(one.unit, "сум"); assert.equal(flat(one.line), "5 уроков из 12 в ноябре"); assert.equal(one.expandable, false);
  const same = B.enrolBarOf([row("a", "А", 188000), row("b", "Б", 188000), row("c", "В", 188000)]);
  assert.equal(flat(same.totalText), "564 000"); assert.equal(flat(same.line), "по 188 000 · 5 уроков из 12 в ноябре");
  const some = B.enrolBarOf([row("a", "А", 188000), row("b", "Б", 188000), row("c", "В", 188000), row("d", "Г", null)]);
  assert.equal(flat(some.line), "троим по 188 000 · 5 уроков из 12 в ноябре");
  const named = B.enrolBarOf([row("a", "Анвар Каримов", 188000), row("b", "Саид", null)]);
  assert.equal(flat(named.line), "Анвар Каримов — 188 000 · 5 уроков из 12 в ноябре");
  const many = B.enrolBarOf([row("a", "А", 188000), row("b", "Б", 188000), row("c", "В", 188000), row("d", "Г", 188000), row("e", "Д", 188000), row("f", "Е", null)]);
  assert.equal(flat(many.line), "5 ученикам по 188 000 · 5 уроков из 12 в ноябре");
});

test("the bar: different sums or periods - a short line «за октябрь и ноябрь» and the list «По ученикам»; nobody pays - no sum", () => {
  const oct = { label: "октябрь", from: "2026-10-27", amount: 89000, lessons: 2, lessons_in_period: 9, whole: false };
  const whole = { label: "ноябрь", from: "", amount: 400000, lessons: 12, lessons_in_period: 12, whole: true };
  const mixed = B.enrolBarOf([row("a", "А", 489000, [oct, whole]), row("b", "Б", 489000, [oct, whole]), row("c", "В", 150000)]);
  assert.equal(flat(mixed.totalText), "1 128 000"); assert.equal(flat(mixed.line), "за октябрь и ноябрь"); assert.equal(mixed.expandable, true);
  const two = B.enrolBarOf([row("a", "А", 188000), row("b", "Б", 150000)]);
  assert.equal(flat(two.line), "за ноябрь"); assert.equal(two.expandable, true, "the sums differ: the list is offered");
  const oneStudent = B.enrolBarOf([row("a", "А", 489000, [oct, whole])]);
  assert.equal(flat(oneStudent.line), "за октябрь и ноябрь"); assert.equal(oneStudent.expandable, true, "one student with two periods: the periods are offered");
  const nobody = B.enrolBarOf([row("a", "А", null)]);
  assert.equal(nobody.total, null); assert.equal(nobody.line, null);
  const dates = B.enrolBarOf([row("a", "А", 100, [{ label: "19.11–18.12", from: "", amount: 100, lessons: 6, lessons_in_period: 12, whole: false }])]);
  assert.equal(flat(dates.line), "6 уроков из 12 за период 19.11–18.12", "a period given by dates is not a month");
  assert.equal(flat(B.lessonsLine({ label: "20.11–19.12", from: "", amount: 100, lessons: 13, lessons_in_period: 0, whole: true })), "13 уроков · весь период 20.11–19.12", "lessons > 0: the count stays");
  const noLessons = { label: "22.11–21.12", from: "", amount: 100, lessons: 0, lessons_in_period: 0, whole: true };
  assert.equal(B.lessonsLine(noLessons), null, "sum > 0 and 0 lessons: no count");
  assert.equal(flat(B.enrolBarOf([row("a", "А", 100, [noLessons])]).line), "за 22.11–21.12");
  assert.equal(B.periodsOf(["октябрь", "ноябрь", "декабрь"]), "за октябрь, ноябрь и декабрь");
  const swapped = B.enrolBarOf([row("a", "А", 188000), row("b", "Б", 489000, [oct, whole])]);
  assert.equal(flat(swapped.line), "за октябрь и ноябрь", "the order of the longest story, not of the choosing");
  assert.equal(B.lessonsLine({ label: "март", from: "", amount: 1, lessons: 1, lessons_in_period: 22, whole: false }), "1 урок из 22 в марте");
  assert.equal(B.lessonsLine({ label: "май", from: "", amount: 1, lessons: 3, lessons_in_period: 22, whole: false }), "3 урока из 22 в мае");
});

test("the button names the action: «Зачислить», «двоих / троих / четверых», from five - the number; a transfer says «Перевести»; the card window names the group", () => {
  assert.deepEqual([0, 1, 2, 3, 4, 5, 8, 12].map((n) => B.enrolButtonLabel(n)), ["Зачислить", "Зачислить", "Зачислить двоих", "Зачислить троих", "Зачислить четверых", "Зачислить 5", "Зачислить 8", "Зачислить 12"]);
  assert.deepEqual([1, 2, 3, 4, 6].map((n) => B.enrolButtonLabel(n, "transfer")), ["Перевести", "Перевести двоих", "Перевести троих", "Перевести четверых", "Перевести 6"]);
  assert.equal(B.enrolIntoLabel("Физика 7"), "Зачислить в «Физика 7»");
  assert.equal(B.enrolIntoLabel("Физика 7", "transfer"), "Перевести в «Физика 7»");
});

test("the conditions line: the day in words, the price of the group or an own price; a sum equal to the group's is not an own price", () => {
  assert.equal(T.dayMonthWords("2026-11-19"), "19 ноября"); assert.equal(T.dayMonthWords("2026-03-01"), "1 марта");
  assert.equal(T.dayMonthWords("2025-12-30", "2026-11-19"), "30 декабря 2025", "the year is said when it is not this one");
  assert.equal(T.dayMonthWords(""), ""); assert.equal(T.dayMonthWords("19.11.2026"), "");
  assert.equal(flat(T.termsLine({ payFrom: "2026-11-19", groupHasPrice: true, ownAmount: "" })), "Оплата с 19 ноября, по цене группы");
  assert.equal(flat(T.termsLine({ payFrom: "2026-11-17", groupHasPrice: true, ownAmount: "400 000" })), "Оплата с 17 ноября, своя цена 400 000");
  assert.equal(flat(T.termsLine({ payFrom: "2026-11-19", groupHasPrice: false, ownAmount: "" })), "Оплата с 19 ноября");
  assert.equal(flat(T.termsLine({ payFrom: "", groupHasPrice: true, ownAmount: "" })), "По цене группы");
  assert.equal(flat(T.termsLine({ payFrom: "2026-11-19", groupHasPrice: true, ownAmount: "", opening: true })), "Оплата с 19 ноября, по цене группы, с остатком на начало учёта");
  assert.equal(T.isOwnPrice("", 450000), false); assert.equal(T.isOwnPrice("450 000", 450000), false); assert.equal(T.isOwnPrice("400 000", 450000), true); assert.equal(T.isOwnPrice("400000", null), true);
  assert.equal(flat(T.priceInWords(450000, "Цена в месяц")), "450 000 сум в месяц"); assert.equal(flat(T.priceInWords(300000, "Цена пакета")), "300 000 сум за пакет"); assert.equal(T.priceInWords(0, "Цена в месяц"), "бесплатно");
});

test("the reason of the day is the server's own words without the date the line already says", () => {
  // both phrases of the server (S2): the day is today / the day is ahead
  assert.equal(T.payFromReason("Оплата с 19.11.2026 — сегодня у группы занятие"), "сегодня у группы занятие");
  assert.equal(T.payFromReason("Оплата с 21.11.2026 — ближайшее занятие группы"), "ближайшее занятие группы");
  assert.equal(T.payFromReason("Оплата считается с 19.11.2026: у группы нет занятий в ближайшие дни"), "у группы нет занятий в ближайшие дни");
  assert.equal(T.payFromReason("первое занятие"), "первое занятие"); assert.equal(T.payFromReason(""), null); assert.equal(T.payFromReason(null), null);
});

test("the message of success: «Трое зачислены в «…»» and the line about what is to be paid; without the group's name the old text", () => {
  const base = { added: 3, skipped: 0, skippedLines: [], warnings: [], infos: [] };
  const three = E.enrolToast({ ...base, groupName: "М11 БС", addedNames: ["А", "Б", "В"], payNowLine: "Всего к оплате до 24.11: 564 000 сум (за 15 уроков) — на странице «Оплаты»" });
  assert.equal(three.text, "Трое зачислены в «М11 БС»"); assert.equal(three.type, "success"); assert.deepEqual(three.details, ["Всего к оплате до 24.11: 564 000 сум (за 15 уроков) — на странице «Оплаты»"]);
  assert.equal(E.enrolToast({ ...base, added: 1, groupName: "М11 БС", addedNames: ["Анвар Каримов"] }).text, "Анвар Каримов зачислен в «М11 БС»");
  assert.equal(E.enrolToast({ ...base, added: 2, groupName: "Г" }).text, "Двое зачислены в «Г»");
  assert.equal(E.enrolToast({ ...base, added: 4, groupName: "Г" }).text, "Четверо зачислены в «Г»");
  assert.deepEqual([5, 8, 11, 21, 22, 25].map((n) => E.enrolToast({ ...base, added: n, groupName: "Г" }).text), ["Зачислено 5 учеников в «Г»", "Зачислено 8 учеников в «Г»", "Зачислено 11 учеников в «Г»", "Зачислено 21 ученик в «Г»", "Зачислено 22 ученика в «Г»", "Зачислено 25 учеников в «Г»"]);
  assert.equal(E.enrolToast({ ...base }).text, "Зачислено учеников: 3");
  assert.equal(E.enrolToast({ ...base, added: 2, skipped: 1, groupName: "Г" }).type, "warning", "somebody refused: not a plain success");
  assert.equal(three.details.length > 0, true, "a message with details stays long (10 s)");
});

test("Money-2 fix 12: serverPhraseShown - a hyphen inside «…» is non-breaking (U+2011), the rest of the sentence stays; the toast carries it too", () => {
  const { serverPhraseShown } = require(path.join(root, "src/lib/enrol-labels.ts"));
  const text = "Долг 42 000 сум останется за учеником в группе «М11 ВС Вт-Чт-Сб»: он был в ней по 20-е число; «Алгебра 7 (вт/пт)» и «Пн-Ср-Пт».";
  assert.equal(serverPhraseShown(text), "Долг 42 000 сум останется за учеником в группе «М11 ВС Вт‑Чт‑Сб»: он был в ней по 20-е число; «Алгебра 7 (вт/пт)» и «Пн‑Ср‑Пт».");
  assert.equal(serverPhraseShown(null), null);
  assert.equal(serverPhraseShown("без кавычек - как есть"), "без кавычек - как есть");
  const toast = E.assignDoneToast({ studentName: "Анвар", groupName: "М11 ВС Вт-Чт-Сб", transfer: true, warnings: ["Долг останется в группе «М11 ВС Вт-Чт-Сб»: 42 000"], infos: [] });
  assert.equal(toast.details[0], "Долг останется в группе «М11 ВС Вт‑Чт‑Сб»: 42 000");
});

// PAY-TAILS (stage walk): a part with a sum and 0 lessons (a return in the same period: the server does not know the number) says no number of lessons; with lessons - as before.
test("the lessons of a part: 0 lessons with a sum - no number anywhere (the real answers of the server)", () => {
  const real = (name) => JSON.parse(fs.readFileSync(path.join(root, "tests", "fixtures", "paytails", "part20", `${name}.json`), "utf8"));
  const back = real("bulk_return_same_period").students[0].billing.immediate;
  assert.equal(back.lessons, 0);
  assert.equal(back.parts[0].lessons, 0);
  assert.ok(back.parts[0].amount > 0);
  const P = require(path.join(root, "src/lib/pay-from.ts"));
  assert.equal(B.lessonsLine(back.parts[0]), null);
  const bar = B.enrolBarOf([{ id: "a", name: "Тимур Возвратов", amount: back.amount, parts: back.parts }, { id: "b", name: "Олег Новичков", amount: null, parts: [] }]);
  assert.equal(flat(bar.line), "Тимур Возвратов — 100 000");
  assert.ok(!/урок/.test(String(bar.line)));
  const all = B.enrolBarOf([{ id: "a", name: "Тимур Возвратов", amount: back.amount, parts: back.parts }]);
  assert.ok(!/урок/.test(String(all.line)), `one student: ${all.line}`);
  for (const text of [...P.immediatePartLines(back.parts), ...P.immediatePartRows(back.parts).map((r) => r.label)]) assert.ok(!/урок/.test(text), text);
  // lessons > 0: the line stays as it was
  const two = real("return_preview_no_break").billing.immediate;
  assert.equal(two.parts[0].lessons, 2);
  const line = B.lessonsLine(two.parts[0]);
  assert.match(line, /^2 урока из \d+ в /);
  assert.ok(P.immediatePartLines(two.parts)[0].includes("2 урока из"));
  assert.ok(P.immediatePartRows(two.parts)[0].label.includes("2 урока из"));
});
