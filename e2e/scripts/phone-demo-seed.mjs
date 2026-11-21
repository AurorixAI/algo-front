/**
 * Data of the phone stand (npm run e2e:phone-demo): one centre - the organisation of the passwordless sign-in of the stand
 * (POST /auth/dev-login) - filled ONLY through the routes of the product, as e2e/support/api.ts does.  No database write.
 * Everything is relative to the stand clock (GET /auth/dev/clock), so the picture is the same on any day.
 * Returns what was created and what the server refused (`skipped`) - nothing is invented.
 */

const TASHKENT_DAYS = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400_000).toISOString().slice(0, 10);
const isoWeekday = (iso) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const wrap = (d) => ((d - 1 + 70) % 7) + 1;

class Client {
  constructor(base) {
    this.base = base;
    this.cookie = "";
    this.ip = `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.7`;
  }
  async call(method, path, { body, query } = {}) {
    const url = new URL(`${this.base}/api/v1${path}`);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", "X-Real-IP": this.ip, ...(this.cookie ? { Cookie: this.cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = text;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* text */
    }
    if (!res.ok) throw Object.assign(new Error(`${method} ${path}: HTTP ${res.status} ${JSON.stringify(data?.detail ?? data).slice(0, 240)}`), { status: res.status, data });
    return { data, res };
  }
  get = async (p, query) => (await this.call("GET", p, { query })).data;
  post = async (p, body, query) => (await this.call("POST", p, { body: body ?? {}, query })).data;
  put = async (p, body) => (await this.call("PUT", p, { body: body ?? {} })).data;
}

async function devLogin(base, role) {
  const c = new Client(base);
  const { data, res } = await c.call("POST", "/auth/dev-login", { query: { role } });
  c.cookie = res.headers
    .getSetCookie()
    .map((raw) => raw.split(";")[0].trim())
    .filter((p) => p.indexOf("=") > 0)
    .join("; ");
  c.userId = data.user.id;
  return c;
}

export async function seedPhoneDemo(base, log = console.log) {
  const created = []; // {state, name, group, note}
  const skipped = []; // {state, why}
  const owner = await devLogin(base, "owner");
  const teacher = await devLogin(base, "teacher"); // the teacher of the stand's centre: the groups are his
  await devLogin(base, "admin"); // makes sure the admin of the centre exists

  const clock = await owner.get("/auth/dev/clock");
  const today = clock.now_business.slice(0, 10);
  const wd = isoWeekday(today);
  log(`stand business time ${clock.now_business.slice(0, 16)}, weekday ${wd}`);

  // the centre: «Общий месяц» (the default of a new centre, read back below), term 5 days, the administrator's right to money ON
  // the accounting of a new centre starts today and «Оплата с» cannot be earlier (PAY_FROM_RANGE): it is moved back FIRST, while the centre has no money rows
  await owner.put("/auth/org/settings/payments", { pay_due_days: 5, admin_can_manage: true, accounting_start_date: TASHKENT_DAYS(today, -120) });
  const settings = await owner.get("/auth/org/settings/payments");

  const NAME_A = "Математика 7 углублённая (длинное название группы)";
  const mkGroup = async (name, priceAmount) => {
    const g = await owner.post("/auth/org/groups", { name, class_level: 7, teacher_id: teacher.userId, lesson_type: "group" });
    if (priceAmount) await owner.put(`/auth/org/groups/${g.id}/price`, { amount: priceAmount, valid_from: TASHKENT_DAYS(today, -120) });
    return g;
  };
  const slots = async (g, weekdays, start, end) => {
    for (const dayOfWeek of weekdays) {
      await owner.post("/auth/org/schedule/lessons", { groupId: g.id, dayOfWeek, startTime: start, endTime: end, topic: "Урок" });
    }
  };
  const gA = await mkGroup(NAME_A, 2_400_000);
  await slots(gA, [wd, wrap(wd + 2), wrap(wd + 4)], "14:00", "15:00"); // a lesson TODAY (14:00, the stand is at 10:00) and two more days
  const gB = await mkGroup("Физика 9 (вечерняя)", 1_800_000);
  await slots(gB, [wrap(wd + 2), wrap(wd + 4)], "16:00", "17:00"); // the nearest lesson in 2 days
  const gC = await mkGroup("Английский для начинающих (без цены)", null);
  await slots(gC, [wrap(wd + 1), wrap(wd + 3)], "18:00", "19:00");

  const phone = () => `+99890${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
  const student = async (last, first) => {
    const s = await owner.post("/auth/org/students", { first_name: first, last_name: last, class_level: 7, student_phone: phone() });
    return s;
  };
  const enrol = async (g, s, payFrom, mode) => owner.post(`/auth/org/groups/${g.id}/students/${s.id}`, payFrom ? { pay_from: payFrom } : {}, mode ? { mode } : undefined);
  const memberOf = async (s, g) => (await owner.get(`/auth/org/students/${s.id}/memberships`)).find((m) => m.group_id === g.id);
  const pay = async (s, g, amount) => {
    const m = await memberOf(s, g);
    return owner.post(`/auth/org/memberships/${m.membership_id}/payments`, { amount, paid_on: today, method: "cash" });
  };
  const note = (state, name, group, extra = "") => created.push({ state, name, group: group.name.slice(0, 24), note: extra });
  const attempt = async (state, name, fn) => {
    try {
      await fn();
    } catch (e) {
      skipped.push({ state, name, why: String(e.message).slice(0, 300) });
      log(`NOT CREATED ${state} / ${name}: ${String(e.message).slice(0, 200)}`);
    }
  };

  // ---- 5 debtors: old unpaid months (the age strip: >60, >30, ~25 days) and the started month with the term gone
  const debtors = [
    ["Абдурахмонов", "Мухаммадюсуф", gA, -100, "долг, давность больше 60 дней"],
    ["Рахматуллаева", "Азизахон", gA, -70, "долг, давность больше 60 дней"],
    ["Ким", "Станислав", gB, -45, "долг, давность больше 30 дней"],
    ["Тургунбоев", "Эльдор", gA, -35, "долг, давность больше 30 дней"],
  ];
  for (const [last, first, g, from, why] of debtors) {
    await attempt("должник", `${last} ${first}`, async () => {
      const s = await student(last, first);
      await enrol(g, s, TASHKENT_DAYS(today, from));
      note("должник", `${last} ${first}`, g, why);
      if (from <= -45) {
        // «остаток на начало»: the debt of the days before the stay, dated the first day of it (older than 30 / 60 days)
        const m = await memberOf(s, g);
        try {
          await owner.put(`/auth/org/memberships/${m.membership_id}/opening-balance`, { debt_amount: 900_000, debt_on: TASHKENT_DAYS(today, from), note: "долг с прошлого учёта" });
          note("остаток на начало (долг)", `${last} ${first}`, g, `900000 на ${TASHKENT_DAYS(today, from)}`);
        } catch (e) {
          skipped.push({ state: "остаток на начало (долг)", name: `${last} ${first}`, why: String(e.message).slice(0, 300) });
        }
      }
    });
  }
  // the debtor with two sums: an old debt in group A + a new membership «к оплате» (enrolled today) in group B
  let twoSums = null;
  await attempt("должник с двумя суммами", "Исмоилова Нигора", async () => {
    twoSums = await student("Исмоилова", "Нигора");
    await enrol(gA, twoSums, TASHKENT_DAYS(today, -50));
    await enrol(gB, twoSums, today, "add"); // a second group of the same student: «добавить», not a transfer
    note("должник с двумя суммами", "Исмоилова Нигора", gA, "долг в «Математика…» + «к оплате» в «Физика 9»");
  });

  // ---- 3 «к оплате»: enrolled today
  for (const [last, first, g] of [["Каримова", "Дилноза", gA], ["Петров", "Артём", gA], ["Юсупова", "Малика", gB]]) {
    await attempt("к оплате", `${last} ${first}`, async () => {
      const s = await student(last, first);
      await enrol(g, s, today);
      note("к оплате", `${last} ${first}`, g, "записан сегодня");
    });
  }

  // ---- paid the month (2) and an advance (1): the amount is what the server says the membership owes
  const owed = async (s, g) => {
    const m = await memberOf(s, g);
    return (m.debt_amount ?? 0) + (m.due_amount ?? 0);
  };
  for (const [last, first, g, extra] of [["Соколова", "Ирина", gA, 0], ["Назаров", "Бекзод", gB, 0], ["Мирзаева", "Гулноза", gA, 1_200_000]]) {
    const state = extra ? "аванс" : "оплатил месяц";
    await attempt(state, `${last} ${first}`, async () => {
      const s = await student(last, first);
      await enrol(g, s, TASHKENT_DAYS(today, -3));
      const need = await owed(s, g);
      if (!need) throw new Error("the server shows nothing to pay for this membership");
      await pay(s, g, need + extra);
      note(state, `${last} ${first}`, g, extra ? `оплата на ${need + extra}, начислено ${need}` : `оплачено ${need}`);
    });
  }

  // ---- left with a debt / left with an advance
  await attempt("ушёл с долгом", "Фазылов Ренат", async () => {
    const s = await student("Фазылов", "Ренат");
    await enrol(gA, s, TASHKENT_DAYS(today, -40));
    await owner.post(`/auth/org/groups/${gA.id}/students/${s.id}/leave`, { reason: "переехал", settle: [] });
    note("ушёл с долгом", "Фазылов Ренат", gA, "без списания и возврата");
  });
  await attempt("ушёл с авансом", "Хасанова Севара", async () => {
    const s = await student("Хасанова", "Севара");
    await enrol(gA, s, TASHKENT_DAYS(today, -3));
    const need = await owed(s, gA);
    await pay(s, gA, need + 1_000_000);
    await owner.post(`/auth/org/groups/${gA.id}/students/${s.id}/leave`, { reason: "переехала", settle: [] });
    note("ушёл с авансом", "Хасанова Севара", gA, `аванс ${1_000_000}, оставлен на счёте`);
  });

  // ---- on pause
  await attempt("на паузе", "Алимов Тимур", async () => {
    const s = await student("Алимов", "Тимур");
    await enrol(gA, s, TASHKENT_DAYS(today, -3));
    const m = await memberOf(s, gA);
    await owner.post(`/auth/org/memberships/${m.membership_id}/pauses`, { first_day: today, last_day: TASHKENT_DAYS(today, 14), reason: "болезнь" });
    note("на паузе", "Алимов Тимур", gA, "пауза 14 дней с сегодня");
  });

  // ---- enrolled in a group whose first lesson is ahead (no «Оплата с»: charged from the first lesson)
  await attempt("первый урок впереди", "Юлдашева Зарина", async () => {
    const s = await student("Юлдашева", "Зарина");
    await enrol(gB, s);
    note("первый урок впереди", "Юлдашева Зарина", gB, "без «Оплата с»");
  });

  // ---- the group without a price: two students
  for (const [last, first] of [["Беков", "Санжар"], ["Ли", "Алина"]]) {
    await attempt("группа без цены", `${last} ${first}`, async () => {
      const s = await student(last, first);
      await enrol(gC, s);
      note("группа без цены", `${last} ${first}`, gC);
    });
  }

  const summary = await owner.get("/auth/org/payments/summary");
  return { today, wd, settings, created, skipped, summary, groups: { A: gA.id, B: gB.id, C: gC.id } };
}
