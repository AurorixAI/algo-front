#!/usr/bin/env node
/**
 * Generates demo fixtures: tasks (15-20 per class), skills, textbooks, org, invites, exams.
 * Run: node demo/scripts/build-fixtures.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CURRICULUM = path.join(ROOT, "..", "content-service", "data", "curriculum");

function readImportance(classLevel) {
  const p = path.join(CURRICULUM, `importance_class${classLevel}.json`);
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf8")).data ?? [];
}

function buildSkillTree(classLevel) {
  const data = readImportance(classLevel);
  return data.map((cluster, ci) => ({
    id: cluster.cluster_id,
    name: cluster.cluster_name,
    level: 1,
    children: (cluster.subtopics ?? []).map((sub, si) => ({
      id: sub.node_id,
      name: sub.node_id.replace(/_/g, " "),
      level: 2,
      children: [
        {
          id: `${sub.node_id}_SK1`,
          name: `Навык ${si + 1}: ${cluster.cluster_name}`,
          level: 3,
          children: [
            {
              id: `${sub.node_id}_L4`,
              name: `Задачи — ${sub.node_id}`,
              level: 4,
            },
          ],
        },
      ],
    })),
  }));
}

function mkDistractors(correct, variants) {
  return variants.slice(0, 3).map((v, i) => ({
    value: v,
    error_type: ["sign_error", "arithmetic", "formula"][i % 3],
    explanation: `Типичная ошибка: ${v}`,
    plausibility: 0.75 - i * 0.1,
  }));
}

const TASK_TEMPLATES = {
  5: [
    { q: "Вычислите: $348 + 267$", a: "615", d: ["614", "625", "515"], skill: "G5_P06", topic: "G5_T02", name: "Сложение" },
    { q: "Вычислите: $1000 - 437$", a: "563", d: ["573", "463", "653"], skill: "G5_P06", topic: "G5_T02", name: "Вычитание" },
    { q: "Вычислите: $24 \\times 15$", a: "360", d: ["350", "370", "340"], skill: "G5_P09", topic: "G5_T03", name: "Умножение" },
    { q: "Вычислите: $144 \\div 12$", a: "12", d: ["11", "13", "14"], skill: "G5_P10", topic: "G5_T03", name: "Деление" },
    { q: "Найдите значение $x$: $x + 17 = 42$", a: "25", d: ["24", "26", "59"], skill: "G5_P07", topic: "G5_T02", name: "Уравнения" },
    { q: "Найдите значение $x$: $3x = 27$", a: "9", d: ["8", "10", "81"], skill: "G5_P08", topic: "G5_T02", name: "Уравнения" },
    { q: "Какое число больше: $\\frac{3}{5}$ или $\\frac{2}{3}$?", a: "2/3", d: ["3/5", "равны", "нельзя сравнить"], skill: "G5_P11", topic: "G5_T04", name: "Дроби" },
    { q: "Вычислите: $\\frac{1}{2} + \\frac{1}{4}$", a: "3/4", d: ["2/4", "1/3", "2/6"], skill: "G5_P12", topic: "G5_T04", name: "Дроби" },
    { q: "Периметр квадрата со стороной $7$ см равен:", a: "28", d: ["14", "49", "21"], skill: "G5_P15", topic: "G5_T05", name: "Геометрия" },
    { q: "Площадь прямоугольника $6 \\times 4$ равна:", a: "24", d: ["20", "10", "28"], skill: "G5_P16", topic: "G5_T05", name: "Геометрия" },
    { q: "Округлите $4{,}67$ до десятых", a: "4.7", d: ["4.6", "5", "4.67"], skill: "G5_P05", topic: "G5_T01", name: "Округление" },
    { q: "Сколько сантиметров в $2{,}5$ метрах?", a: "250", d: ["25", "2500", "200"], skill: "G5_P18", topic: "G5_T06", name: "Единицы" },
    { q: "Найдите НОД$(12, 18)$", a: "6", d: ["3", "36", "2"], skill: "G5_P20", topic: "G5_T03", name: "НОД" },
    { q: "Найдите НОК$(4, 6)$", a: "12", d: ["24", "2", "10"], skill: "G5_P21", topic: "G5_T03", name: "НОК" },
    { q: "Вычислите: $(-5) + 8$", a: "3", d: ["-3", "13", "-13"], skill: "G5_P22", topic: "G5_T07", name: "Целые числа" },
    { q: "Вычислите: $(-3) \\times (-4)$", a: "12", d: ["-12", "7", "-7"], skill: "G5_P23", topic: "G5_T07", name: "Целые числа" },
    { q: "Решите: $2x - 5 = 11$", a: "8", d: ["7", "9", "3"], skill: "G5_P08", topic: "G5_T02", name: "Уравнения" },
    { q: "Какая дробь равна $0{,}5$?", a: "1/2", d: ["1/5", "2/5", "5/1"], skill: "G5_P12", topic: "G5_T04", name: "Дроби" },
  ],
  6: [
    { q: "Приведите к общему знаменателю: $\\frac{2}{3}$ и $\\frac{3}{4}$", a: "8/12 и 9/12", d: ["6/12 и 9/12", "2/4 и 3/4", "8/9"], skill: "G6_P04", topic: "G6_T01", name: "Дроби" },
    { q: "Вычислите: $\\frac{2}{3} + \\frac{1}{6}$", a: "5/6", d: ["3/9", "1/2", "3/6"], skill: "G6_P05", topic: "G6_T01", name: "Дроби" },
    { q: "Вычислите: $\\frac{3}{4} \\times \\frac{2}{5}$", a: "3/10", d: ["6/9", "5/9", "6/20"], skill: "G6_P06", topic: "G6_T01", name: "Дроби" },
    { q: "Вычислите: $\\frac{5}{6} \\div \\frac{1}{3}$", a: "5/2", d: ["5/18", "2/5", "3/5"], skill: "G6_P07", topic: "G6_T01", name: "Дроби" },
    { q: "Найдите $x$: $\\frac{x}{4} = 3$", a: "12", d: ["7", "1.33", "9"], skill: "G6_P08", topic: "G6_T02", name: "Уравнения" },
    { q: "Найдите $x$: $2x + 3 = 15$", a: "6", d: ["5", "7", "9"], skill: "G6_P09", topic: "G6_T02", name: "Уравнения" },
    { q: "Вычислите: $(-2)^3$", a: "-8", d: ["8", "-6", "6"], skill: "G6_P10", topic: "G6_T03", name: "Степени" },
    { q: "Вычислите: $2^4$", a: "16", d: ["8", "32", "6"], skill: "G6_P11", topic: "G6_T03", name: "Степени" },
    { q: "Упростите: $3a + 2a$", a: "5a", d: ["6a", "5a²", "a"], skill: "G6_P12", topic: "G6_T04", name: "Выражения" },
    { q: "Вычислите при $a=2$: $3a - 1$", a: "5", d: ["4", "6", "7"], skill: "G6_P13", topic: "G6_T04", name: "Выражения" },
    { q: "Площадь треугольника с основанием $8$ и высотой $5$:", a: "20", d: ["40", "13", "10"], skill: "G6_P15", topic: "G6_T05", name: "Геометрия" },
    { q: "Объём куба с ребром $3$ см:", a: "27", d: ["9", "18", "6"], skill: "G6_P16", topic: "G6_T05", name: "Геометрия" },
    { q: "Найдите процент: $15\\%$ от $200$", a: "30", d: ["15", "35", "25"], skill: "G6_P18", topic: "G6_T06", name: "Проценты" },
    { q: "Число увеличили на $20\\%$ и получили $120$. Найдите число.", a: "100", d: ["96", "110", "144"], skill: "G6_P19", topic: "G6_T06", name: "Проценты" },
    { q: "Решите: $x - 7 = -3$", a: "4", d: ["-10", "10", "-4"], skill: "G6_P09", topic: "G6_T02", name: "Уравнения" },
    { q: "Сократите дробь $\\frac{12}{18}$", a: "2/3", d: ["6/9", "4/6", "3/4"], skill: "G6_P04", topic: "G6_T01", name: "Дроби" },
    { q: "Найдите среднее: $4, 6, 8$", a: "6", d: ["5", "7", "18"], skill: "G6_P20", topic: "G6_T07", name: "Статистика" },
    { q: "Координата точки $A(-3)$ на оси — это:", a: "-3", d: ["3", "0", "1/3"], skill: "G6_P21", topic: "G6_T03", name: "Координаты" },
  ],
  7: [
    { q: "Вычислите: $(-3) + (-7)$", a: "-10", d: ["10", "-4", "4"], skill: "G7_P01", topic: "G7_T01", name: "Рациональные" },
    { q: "Вычислите: $\\frac{2}{3} \\cdot (-\\frac{9}{4})$", a: "-3/2", d: ["3/2", "-6/7", "6/7"], skill: "G7_P02", topic: "G7_T01", name: "Рациональные" },
    { q: "Упростите: $2(x + 3) - x$", a: "x + 6", d: ["3x + 6", "x + 3", "2x + 3"], skill: "G7_P05", topic: "G7_T02", name: "Выражения" },
    { q: "Раскройте скобки: $-(a - 4)$", a: "-a + 4", d: ["-a - 4", "a + 4", "a - 4"], skill: "G7_P06", topic: "G7_T02", name: "Выражения" },
    { q: "Решите: $3x - 9 = 0$", a: "3", d: ["-3", "9", "0"], skill: "G7_P08", topic: "G7_T03", name: "Уравнения" },
    { q: "Решите: $\\frac{x}{5} = 2$", a: "10", d: ["7", "2.5", "5"], skill: "G7_P09", topic: "G7_T03", name: "Уравнения" },
    { q: "Решите: $2x + 1 = 7$", a: "3", d: ["4", "2", "8"], skill: "G7_P08", topic: "G7_T03", name: "Уравнения" },
    { q: "Найдите $k$: прямая $y = kx$ проходит через $(2; 6)$", a: "3", d: ["2", "4", "1/3"], skill: "G7_P12", topic: "G7_T04", name: "Функции" },
    { q: "График $y = 2x - 1$ пересекает ось $Oy$ в точке:", a: "(0; -1)", d: ["(0; 1)", "(1; 0)", "(0; 2)"], skill: "G7_P13", topic: "G7_T04", name: "Функции" },
    { q: "Сумма углов треугольника равна:", a: "180°", d: ["90°", "360°", "270°"], skill: "G7_P15", topic: "G7_T05", name: "Геометрия" },
    { q: "В прямоугольном треугольнике катеты $3$ и $4$. Гипотенуза:", a: "5", d: ["7", "6", "25"], skill: "G7_P16", topic: "G7_T05", name: "Геометрия" },
    { q: "Вычислите: $(-2)^4$", a: "16", d: ["-16", "8", "-8"], skill: "G7_P18", topic: "G7_T06", name: "Степени" },
    { q: "Вычислите: $2^{-3}$", a: "1/8", d: ["-8", "1/6", "6"], skill: "G7_P19", topic: "G7_T06", name: "Степени" },
    { q: "Сократите: $\\frac{a^3 b}{a b^2}$", a: "a²/b", d: ["a/b", "a³/b²", "ab"], skill: "G7_P20", topic: "G7_T07", name: "Многочлены" },
    { q: "Решите: $x^2 = 25$", a: "x = ±5", d: ["x = 5", "x = -5", "x = 25"], skill: "G7_P22", topic: "G7_T03", name: "Уравнения" },
    { q: "Решите: $|x| = 3$", a: "x = ±3", d: ["x = 3", "x = -3", "x = 0"], skill: "G7_P23", topic: "G7_T01", name: "Модуль" },
    { q: "Периметр круга с радиусом $5$ ($\\pi \\approx 3{,}14$):", a: "31.4", d: ["15.7", "78.5", "25"], skill: "G7_P25", topic: "G7_T05", name: "Геометрия" },
    { q: "Вероятность выпадения чётного при броске кубика:", a: "1/2", d: ["1/3", "1/6", "2/3"], skill: "G7_P26", topic: "G7_T08", name: "Вероятность" },
  ],
  8: [
    { q: "Решите: $2x^2 - 16 = 0$", a: "x = ±2√2", d: ["x = ±4", "x = 4", "нет корней"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "B" },
    { q: "Решите: $x^2 - 5x + 6 = 0$", a: "x₁ = 2, x₂ = 3", d: ["x = 1, 6", "x = -2, -3", "x = 5"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "B" },
    { q: "Решите: $x^2 = 49$", a: "x = ±7", d: ["x = 7", "x = -7", "x = 0"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "A" },
    { q: "Упростите: $\\sqrt{50}$", a: "5√2", d: ["25√2", "10√5", "2√5"], skill: "G8_P08", topic: "G8_T02", name: "Корни", diff: "A" },
    { q: "Вычислите: $\\sqrt{16} + \\sqrt{9}$", a: "7", d: ["5", "25", "12"], skill: "G8_P08", topic: "G8_T02", name: "Корни", diff: "A" },
    { q: "Сократите: $\\frac{x^2 - 4}{x - 2}$", a: "x + 2", d: ["x - 2", "x² + 2", "2x"], skill: "G8_P02", topic: "G8_T01", name: "Алг. дроби", diff: "B" },
    { q: "Вычислите: $\\frac{3}{4} + \\frac{1}{6}$", a: "11/12", d: ["4/10", "1/2", "5/6"], skill: "G8_P04", topic: "G8_T01", name: "Алг. дроби", diff: "A" },
    { q: "Решите: $3x - 7 = 2$", a: "3", d: ["2", "4", "9"], skill: "G8_ALG_22", topic: "G8_T03", name: "Линейные уравнения", diff: "A" },
    { q: "Решите: $\\frac{x}{3} = 4$", a: "12", d: ["7", "1.33", "9"], skill: "G8_ALG_22", topic: "G8_T03", name: "Линейные уравнения", diff: "A" },
    { q: "Функция $y = x^2$. При $x = -3$, $y = $", a: "9", d: ["-9", "6", "-6"], skill: "G8_P07", topic: "G8_T02", name: "Функции", diff: "A" },
    { q: "Решите: $x^2 - 9 = 0$", a: "x = ±3", d: ["x = 3", "x = 0", "нет корней"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "A" },
    { q: "Площадь круга $r = 3$ ($\\pi \\approx 3{,}14$):", a: "28.26", d: ["18.84", "9.42", "6.28"], skill: "G8_GEO_10", topic: "G8_T04", name: "Геометрия", diff: "B" },
    { q: "Теорема Пифагора: $c^2 = $", a: "a² + b²", d: ["a² - b²", "2ab", "a + b"], skill: "G8_GEO_11", topic: "G8_T04", name: "Геометрия", diff: "A" },
    { q: "Решите: $(x - 3)(x + 3) = 0$", a: "x = ±3", d: ["x = 3", "x = 0", "x = 9"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "B" },
    { q: "Упростите: $(\\sqrt{3})^2$", a: "3", d: ["9", "√3", "6"], skill: "G8_P08", topic: "G8_T02", name: "Корни", diff: "A" },
    { q: "Решите: $5x + 10 = 0$", a: "-2", d: ["2", "-5", "5"], skill: "G8_ALG_22", topic: "G8_T03", name: "Линейные уравнения", diff: "A" },
    { q: "Решите: $x^2 + 4x + 4 = 0$", a: "x = -2", d: ["x = 2", "x = ±2", "нет корней"], skill: "G8_ALG_23", topic: "G8_T03", name: "Квадратные уравнения", diff: "C" },
    { q: "Вычислите: $2^3 \\cdot 2^{-1}$", a: "4", d: ["2", "8", "1"], skill: "G8_P09", topic: "G8_T02", name: "Степени", diff: "B" },
  ],
};

function buildTasks(classLevel) {
  const templates = TASK_TEMPLATES[classLevel] ?? TASK_TEMPLATES[8];
  return templates.map((t, i) => {
    const diff = t.diff ?? (i < 6 ? "A" : i < 14 ? "B" : "C");
    const distractor_meta = mkDistractors(t.a, t.d);
    const answer_options = [t.a, ...t.d.slice(0, 3)];
    return {
      task_id: `G${classLevel}_DEMO_${String(i + 1).padStart(2, "0")}`,
      skill_id: t.skill,
      skill_name: t.name,
      topic_id: t.topic,
      paragraph_id: parseInt(t.skill.replace(/\D/g, "").slice(-2) || "1", 10) || i + 1,
      class_level: classLevel,
      difficulty: diff,
      question_text: t.q,
      question_latex: t.q,
      answer_type: classLevel >= 7 && t.q.includes("x") ? "equation_solution" : "exact_number",
      correct_answer: t.a,
      answer_options,
      distractor_meta,
    };
  });
}

function buildTextbooks(classLevel) {
  return [
    {
      textbook_id: `TB_G${classLevel}_ALG_01`,
      title: `Алгебра ${classLevel} класс (Демо)`,
      class_level: classLevel,
      country: "RU",
      status: "active",
      publisher: "Алго",
    },
    {
      textbook_id: `TB_G${classLevel}_GEO_01`,
      title: `Геометрия ${classLevel} класс (Демо)`,
      class_level: classLevel,
      country: "RU",
      status: "active",
      publisher: "Алго",
    },
  ];
}

function buildToc(classLevel, textbookId) {
  const data = readImportance(classLevel);
  return data.slice(0, 4).map((cluster, ci) => ({
    structure_id: ci + 1,
    title: cluster.cluster_name,
    level: 1,
    children: (cluster.subtopics ?? []).slice(0, 3).map((sub, si) => ({
      structure_id: (ci + 1) * 10 + si + 1,
      title: `§${ci + 1}.${si + 1} ${sub.node_id}`,
      level: 2,
      children: [],
    })),
  }));
}

// Write files
for (const level of [5, 6, 7, 8]) {
  const tasks = buildTasks(level);
  fs.mkdirSync(path.join(ROOT, "fixtures", "tasks"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "fixtures", "tasks", `class${level}.json`),
    JSON.stringify(tasks, null, 2),
  );

  fs.mkdirSync(path.join(ROOT, "fixtures", "skills"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "fixtures", "skills", `class${level}.json`),
    JSON.stringify(buildSkillTree(level), null, 2),
  );

  fs.mkdirSync(path.join(ROOT, "fixtures", "textbooks"), { recursive: true });
  const books = buildTextbooks(level);
  fs.writeFileSync(
    path.join(ROOT, "fixtures", "textbooks", `class${level}.json`),
    JSON.stringify(books, null, 2),
  );

  for (const book of books) {
    fs.writeFileSync(
      path.join(ROOT, "fixtures", "textbooks", `toc_${book.textbook_id}.json`),
      JSON.stringify(buildToc(level, book.textbook_id), null, 2),
    );
  }
}

// org.json
fs.writeFileSync(
  path.join(ROOT, "fixtures", "org.json"),
  JSON.stringify(
    {
      org: {
        id: "org-demo-001",
        name: "Школа «Алго» (Демо)",
        org_type: "private_school",
        city: "Москва",
        status: "active",
      },
      students: [
        { id: "stu-demo-001", first_name: "Алексей", last_name: "Петров", class_level: 8, status: "new" },
        { id: "stu-demo-002", first_name: "Мария", last_name: "Иванова", class_level: 8, status: "diagnosed" },
        { id: "stu-demo-003", first_name: "Дмитрий", last_name: "Сидоров", class_level: 7, status: "new" },
      ],
      admin: {
        email: "demo@algo.ru",
        password: "demo2026",
        first_name: "Демо",
        last_name: "Администратор",
        role: "admin",
        org_role: "admin",
      },
      teacher: {
        email: "teacher@algo.ru",
        password: "demo2026",
        first_name: "Елена",
        last_name: "Учителева",
        role: "teacher",
        org_role: "teacher",
      },
    },
    null,
    2,
  ),
);

// invites
const now = new Date();
const dayAgo = new Date(now.getTime() - 86400000);
const twoHoursAgo = new Date(now.getTime() - 7200000);

fs.mkdirSync(path.join(ROOT, "fixtures", "diagnostics"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "fixtures", "diagnostics", "invites.json"),
  JSON.stringify(
    [
      {
        id: "inv-diag-001",
        code: "DIAG01",
        student_id: "stu-demo-001",
        student_name: "Алексей Петров",
        student_first_name: "Алексей",
        student_last_name: "Петров",
        class_level: 8,
        diagnostic_type: "initial",
        status: "pending",
        org_id: "org-demo-001",
        org_name: "Школа «Алго» (Демо)",
        expires_at: new Date(now.getTime() + 86400000).toISOString(),
        created_at: now.toISOString(),
        started_at: null,
        completed_at: null,
        result: null,
      },
      {
        id: "inv-diag-002",
        code: "DIAG02",
        student_id: "stu-demo-003",
        student_name: "Дмитрий Сидоров",
        student_first_name: "Дмитрий",
        student_last_name: "Сидоров",
        class_level: 7,
        diagnostic_type: "initial",
        status: "confirmed",
        org_id: "org-demo-001",
        org_name: "Школа «Алго» (Демо)",
        expires_at: new Date(now.getTime() + 86400000).toISOString(),
        created_at: dayAgo.toISOString(),
        started_at: null,
        completed_at: null,
        result: null,
      },
      {
        id: "inv-diag-003",
        code: "DIAG03",
        student_id: "stu-demo-002",
        student_name: "Мария Иванова",
        student_first_name: "Мария",
        student_last_name: "Иванова",
        class_level: 8,
        diagnostic_type: "initial",
        status: "completed",
        org_id: "org-demo-001",
        org_name: "Школа «Алго» (Демо)",
        expires_at: new Date(now.getTime() + 86400000).toISOString(),
        created_at: dayAgo.toISOString(),
        started_at: twoHoursAgo.toISOString(),
        completed_at: now.toISOString(),
        cat_session_id: "diag-sess-seed-003",
        result: {
          theta: 0.42,
          accuracy: 0.73,
          recommended_level: "at_grade",
          total_questions: 15,
          correct_answers: 11,
        },
      },
    ],
    null,
    2,
  ),
);

// Pre-built report for DIAG03
fs.writeFileSync(
  path.join(ROOT, "fixtures", "diagnostics", "report_stu-demo-002.json"),
  JSON.stringify(
    {
      session_id: "diag-sess-seed-003",
      student_id: "stu-demo-002",
      grade_level: 8,
      overall_theta: 0.42,
      overall_level: "at_grade",
      confidence_interval: [-0.12, 0.96],
      topic_breakdown: {
        G8_T01: { alpha: 0.8, level: "at_grade", name: "Алгебраические дроби" },
        G8_T02: { alpha: 0.65, level: "at_grade", name: "Функция, степень, корень" },
        G8_T03: { alpha: 0.55, level: "at_grade", name: "Квадратные уравнения" },
        G8_T04: { alpha: 0.9, level: "above_grade", name: "Геометрия" },
      },
      weak_skills: ["G8_ALG_23", "G8_P08"],
      skill_names: {
        G8_ALG_23: "Квадратные уравнения",
        G8_P08: "Арифметический корень",
        G8_P02: "Алгебраические дроби",
        G8_GEO_11: "Теорема Пифагора",
      },
      recommended_start: "G8_ALG_23",
      items_total: 15,
      accuracy: 0.73,
      narrative_ru:
        "Мария показала устойчивый уровень по геометрии — тема освоена выше программы. В алгебре наблюдается неравномерность: линейные уравнения решает уверенно, однако при работе с квадратными уравнениями и иррациональными корнями допускает типичные ошибки знака и неполного разложения на множители.\n\nНаиболее уязвимый блок — квадратные уравнения (G8_ALG_23): в 3 из 4 задач выбиралась ловушка «забытый корень» (только положительный корень). Рекомендуется начать с повторения дискриминанта и вида ax² + c = 0.\n\nПрогноз: при целенаправленной работе 2–3 недели Мария выйдет на уровень «выше программы» по алгебре. Рекомендуем стартовать с навыка «Квадратные уравнения» и параллельно закреплять свойства корней.",
      distractor_errors: [
        { task_id: "G8_DEMO_01", student_answer: "x = ±4", error_type: "arithmetic", explanation: "Ошибка при делении на 2" },
        { task_id: "G8_DEMO_14", student_answer: "x = 3", error_type: "sign_error", explanation: "Учтён только один корень" },
      ],
    },
    null,
    2,
  ),
);

// exams seed
fs.mkdirSync(path.join(ROOT, "fixtures", "exams"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "fixtures", "exams", "seed.json"),
  JSON.stringify(
    {
      exams: [
        {
          exam_id: "EXAM_DEMO_DRAFT",
          title: "Черновик: Алгебра 7 класс",
          status: "draft",
          access_code: null,
          total_time_minutes: 45,
          variants_count: 1,
          tasks_per_variant: 8,
          settings: { time_minutes: 45, mc_mode: "auto", class_level: 7 },
          skills_covered: ["G7_P08", "G7_P09"],
          created_at: now.toISOString(),
          variants: [
            {
              variant_id: "1",
              variant_number: 1,
              total_points: 80,
              tasks: buildTasks(7).slice(0, 8).map((t) => ({
                task_id: t.task_id,
                skill_id: t.skill_id,
                skill_name: t.skill_name,
                difficulty: t.difficulty,
                question_text: t.question_text,
                question_latex: t.question_latex,
                question_image_url: null,
                answer_type: t.answer_type,
                correct_answer: t.correct_answer,
                answer_options: t.answer_options,
                distractor_meta: t.distractor_meta,
                is_template_generated: false,
              })),
            },
          ],
        },
      ],
      sessions: [],
    },
    null,
    2,
  ),
);

console.log("Demo fixtures generated in", ROOT);
