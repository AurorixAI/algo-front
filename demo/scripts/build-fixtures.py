#!/usr/bin/env python3
"""Generates demo seed fixtures (org, diagnostics, exams).

Curriculum data (skills, textbooks, TOC, tasks) comes from the DB export:
    python3 demo/scripts/export-from-db.py

Then run this for seed data only:
    python3 demo/scripts/build-fixtures.py
"""
import json
import os
from datetime import datetime, timedelta, timezone

ROOT = os.path.join(os.path.dirname(__file__), "..")
CURRICULUM = os.path.join(ROOT, "..", "content-service", "data", "curriculum")

TASK_TEMPLATES = {
    5: [
        {"q": "Вычислите: $348 + 267$", "a": "615", "d": ["614", "625", "515"], "skill": "G5_P06", "topic": "G5_T02", "name": "Сложение"},
        {"q": "Вычислите: $1000 - 437$", "a": "563", "d": ["573", "463", "653"], "skill": "G5_P06", "topic": "G5_T02", "name": "Вычитание"},
        {"q": "Вычислите: $24 \\times 15$", "a": "360", "d": ["350", "370", "340"], "skill": "G5_P09", "topic": "G5_T03", "name": "Умножение"},
        {"q": "Вычислите: $144 \\div 12$", "a": "12", "d": ["11", "13", "14"], "skill": "G5_P10", "topic": "G5_T03", "name": "Деление"},
        {"q": "Найдите $x$: $x + 17 = 42$", "a": "25", "d": ["24", "26", "59"], "skill": "G5_P07", "topic": "G5_T02", "name": "Уравнения"},
        {"q": "Найдите $x$: $3x = 27$", "a": "9", "d": ["8", "10", "81"], "skill": "G5_P08", "topic": "G5_T02", "name": "Уравнения"},
        {"q": "Какое число больше: $\\frac{3}{5}$ или $\\frac{2}{3}$?", "a": "2/3", "d": ["3/5", "равны", "нельзя сравнить"], "skill": "G5_P11", "topic": "G5_T04", "name": "Дроби"},
        {"q": "Вычислите: $\\frac{1}{2} + \\frac{1}{4}$", "a": "3/4", "d": ["2/4", "1/3", "2/6"], "skill": "G5_P12", "topic": "G5_T04", "name": "Дроби"},
        {"q": "Периметр квадрата со стороной $7$ см:", "a": "28", "d": ["14", "49", "21"], "skill": "G5_P15", "topic": "G5_T05", "name": "Геометрия"},
        {"q": "Площадь прямоугольника $6 \\times 4$:", "a": "24", "d": ["20", "10", "28"], "skill": "G5_P16", "topic": "G5_T05", "name": "Геометрия"},
        {"q": "Округлите $4{,}67$ до десятых", "a": "4.7", "d": ["4.6", "5", "4.67"], "skill": "G5_P05", "topic": "G5_T01", "name": "Округление"},
        {"q": "Сколько см в $2{,}5$ м?", "a": "250", "d": ["25", "2500", "200"], "skill": "G5_P18", "topic": "G5_T06", "name": "Единицы"},
        {"q": "НОД$(12, 18)$", "a": "6", "d": ["3", "36", "2"], "skill": "G5_P20", "topic": "G5_T03", "name": "НОД"},
        {"q": "НОК$(4, 6)$", "a": "12", "d": ["24", "2", "10"], "skill": "G5_P21", "topic": "G5_T03", "name": "НОК"},
        {"q": "Вычислите: $(-5) + 8$", "a": "3", "d": ["-3", "13", "-13"], "skill": "G5_P22", "topic": "G5_T07", "name": "Целые"},
        {"q": "Вычислите: $(-3) \\times (-4)$", "a": "12", "d": ["-12", "7", "-7"], "skill": "G5_P23", "topic": "G5_T07", "name": "Целые"},
        {"q": "Решите: $2x - 5 = 11$", "a": "8", "d": ["7", "9", "3"], "skill": "G5_P08", "topic": "G5_T02", "name": "Уравнения"},
        {"q": "Какая дробь равна $0{,}5$?", "a": "1/2", "d": ["1/5", "2/5", "5/1"], "skill": "G5_P12", "topic": "G5_T04", "name": "Дроби"},
    ],
    6: [
        {"q": "Вычислите: $\\frac{2}{3} + \\frac{1}{6}$", "a": "5/6", "d": ["3/9", "1/2", "3/6"], "skill": "G6_P05", "topic": "G6_T01", "name": "Дроби"},
        {"q": "Вычислите: $\\frac{3}{4} \\times \\frac{2}{5}$", "a": "3/10", "d": ["6/9", "5/9", "6/20"], "skill": "G6_P06", "topic": "G6_T01", "name": "Дроби"},
        {"q": "Найдите $x$: $2x + 3 = 15$", "a": "6", "d": ["5", "7", "9"], "skill": "G6_P09", "topic": "G6_T02", "name": "Уравнения"},
        {"q": "Вычислите: $(-2)^3$", "a": "-8", "d": ["8", "-6", "6"], "skill": "G6_P10", "topic": "G6_T03", "name": "Степени"},
        {"q": "Упростите: $3a + 2a$", "a": "5a", "d": ["6a", "5a²", "a"], "skill": "G6_P12", "topic": "G6_T04", "name": "Выражения"},
        {"q": "При $a=2$: $3a - 1$", "a": "5", "d": ["4", "6", "7"], "skill": "G6_P13", "topic": "G6_T04", "name": "Выражения"},
        {"q": "Площадь треугольника $b=8, h=5$:", "a": "20", "d": ["40", "13", "10"], "skill": "G6_P15", "topic": "G6_T05", "name": "Геометрия"},
        {"q": "$15\\%$ от $200$", "a": "30", "d": ["15", "35", "25"], "skill": "G6_P18", "topic": "G6_T06", "name": "Проценты"},
        {"q": "Решите: $x - 7 = -3$", "a": "4", "d": ["-10", "10", "-4"], "skill": "G6_P09", "topic": "G6_T02", "name": "Уравнения"},
        {"q": "Сократите $\\frac{12}{18}$", "a": "2/3", "d": ["6/9", "4/6", "3/4"], "skill": "G6_P04", "topic": "G6_T01", "name": "Дроби"},
        {"q": "Вычислите: $\\frac{5}{6} \\div \\frac{1}{3}$", "a": "5/2", "d": ["5/18", "2/5", "3/5"], "skill": "G6_P07", "topic": "G6_T01", "name": "Дроби"},
        {"q": "Найдите $x$: $\\frac{x}{4} = 3$", "a": "12", "d": ["7", "1.33", "9"], "skill": "G6_P08", "topic": "G6_T02", "name": "Уравнения"},
        {"q": "Вычислите: $2^4$", "a": "16", "d": ["8", "32", "6"], "skill": "G6_P11", "topic": "G6_T03", "name": "Степени"},
        {"q": "Объём куба $a=3$:", "a": "27", "d": ["9", "18", "6"], "skill": "G6_P16", "topic": "G6_T05", "name": "Геометрия"},
        {"q": "Среднее $4, 6, 8$", "a": "6", "d": ["5", "7", "18"], "skill": "G6_P20", "topic": "G6_T07", "name": "Статистика"},
        {"q": "Координата $A(-3)$:", "a": "-3", "d": ["3", "0", "1/3"], "skill": "G6_P21", "topic": "G6_T03", "name": "Координаты"},
        {"q": "Число +20% = 120. Число?", "a": "100", "d": ["96", "110", "144"], "skill": "G6_P19", "topic": "G6_T06", "name": "Проценты"},
        {"q": "Приведите $\\frac{2}{3}$ и $\\frac{3}{4}$", "a": "8/12 и 9/12", "d": ["6/12 и 9/12", "2/4 и 3/4", "8/9"], "skill": "G6_P04", "topic": "G6_T01", "name": "Дроби"},
    ],
    7: [
        {"q": "Вычислите: $(-3) + (-7)$", "a": "-10", "d": ["10", "-4", "4"], "skill": "G7_P01", "topic": "G7_T01", "name": "Рациональные"},
        {"q": "Упростите: $2(x + 3) - x$", "a": "x + 6", "d": ["3x + 6", "x + 3", "2x + 3"], "skill": "G7_P05", "topic": "G7_T02", "name": "Выражения"},
        {"q": "Решите: $3x - 9 = 0$", "a": "3", "d": ["-3", "9", "0"], "skill": "G7_P08", "topic": "G7_T03", "name": "Уравнения"},
        {"q": "Решите: $2x + 1 = 7$", "a": "3", "d": ["4", "2", "8"], "skill": "G7_P08", "topic": "G7_T03", "name": "Уравнения"},
        {"q": "Решите: $x^2 = 25$", "a": "x = ±5", "d": ["x = 5", "x = -5", "x = 25"], "skill": "G7_P22", "topic": "G7_T03", "name": "Уравнения"},
        {"q": "Решите: $|x| = 3$", "a": "x = ±3", "d": ["x = 3", "x = -3", "x = 0"], "skill": "G7_P23", "topic": "G7_T01", "name": "Модуль"},
        {"q": "Гипотенуза при $a=3, b=4$:", "a": "5", "d": ["7", "6", "25"], "skill": "G7_P16", "topic": "G7_T05", "name": "Геометрия"},
        {"q": "Вычислите: $(-2)^4$", "a": "16", "d": ["-16", "8", "-8"], "skill": "G7_P18", "topic": "G7_T06", "name": "Степени"},
        {"q": "Вычислите: $2^{-3}$", "a": "1/8", "d": ["-8", "1/6", "6"], "skill": "G7_P19", "topic": "G7_T06", "name": "Степени"},
        {"q": "Раскройте: $-(a - 4)$", "a": "-a + 4", "d": ["-a - 4", "a + 4", "a - 4"], "skill": "G7_P06", "topic": "G7_T02", "name": "Выражения"},
        {"q": "Решите: $\\frac{x}{5} = 2$", "a": "10", "d": ["7", "2.5", "5"], "skill": "G7_P09", "topic": "G7_T03", "name": "Уравнения"},
        {"q": "$y = kx$ через $(2; 6)$, $k =$", "a": "3", "d": ["2", "4", "1/3"], "skill": "G7_P12", "topic": "G7_T04", "name": "Функции"},
        {"q": "Сумма углов треугольника:", "a": "180°", "d": ["90°", "360°", "270°"], "skill": "G7_P15", "topic": "G7_T05", "name": "Геометрия"},
        {"q": "Сократите: $\\frac{a^3 b}{a b^2}$", "a": "a²/b", "d": ["a/b", "a³/b²", "ab"], "skill": "G7_P20", "topic": "G7_T07", "name": "Многочлены"},
        {"q": "Периметр круга $r=5$:", "a": "31.4", "d": ["15.7", "78.5", "25"], "skill": "G7_P25", "topic": "G7_T05", "name": "Геометрия"},
        {"q": "Вероятность чётного на кубике:", "a": "1/2", "d": ["1/3", "1/6", "2/3"], "skill": "G7_P26", "topic": "G7_T08", "name": "Вероятность"},
        {"q": "Вычислите: $\\frac{2}{3} \\cdot (-\\frac{9}{4})$", "a": "-3/2", "d": ["3/2", "-6/7", "6/7"], "skill": "G7_P02", "topic": "G7_T01", "name": "Рациональные"},
        {"q": "$y = 2x - 1$ пересекает $Oy$:", "a": "(0; -1)", "d": ["(0; 1)", "(1; 0)", "(0; 2)"], "skill": "G7_P13", "topic": "G7_T04", "name": "Функции"},
    ],
    8: [
        {"q": "Решите: $2x^2 - 16 = 0$", "a": "x = ±2√2", "d": ["x = ±4", "x = 4", "нет корней"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "B"},
        {"q": "Решите: $x^2 - 5x + 6 = 0$", "a": "x₁ = 2, x₂ = 3", "d": ["x = 1, 6", "x = -2, -3", "x = 5"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "B"},
        {"q": "Решите: $x^2 = 49$", "a": "x = ±7", "d": ["x = 7", "x = -7", "x = 0"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "A"},
        {"q": "Упростите: $\\sqrt{50}$", "a": "5√2", "d": ["25√2", "10√5", "2√5"], "skill": "G8_P08", "topic": "G8_T02", "name": "Корни", "diff": "A"},
        {"q": "Сократите: $\\frac{x^2 - 4}{x - 2}$", "a": "x + 2", "d": ["x - 2", "x² + 2", "2x"], "skill": "G8_P02", "topic": "G8_T01", "name": "Алг. дроби", "diff": "B"},
        {"q": "Решите: $3x - 7 = 2$", "a": "3", "d": ["2", "4", "9"], "skill": "G8_ALG_22", "topic": "G8_T03", "name": "Линейные", "diff": "A"},
        {"q": "Решите: $x^2 - 9 = 0$", "a": "x = ±3", "d": ["x = 3", "x = 0", "нет корней"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "A"},
        {"q": "Теорема Пифагора: $c^2 =$", "a": "a² + b²", "d": ["a² - b²", "2ab", "a + b"], "skill": "G8_GEO_11", "topic": "G8_T04", "name": "Геометрия", "diff": "A"},
        {"q": "Решите: $(x - 3)(x + 3) = 0$", "a": "x = ±3", "d": ["x = 3", "x = 0", "x = 9"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "B"},
        {"q": "Решите: $5x + 10 = 0$", "a": "-2", "d": ["2", "-5", "5"], "skill": "G8_ALG_22", "topic": "G8_T03", "name": "Линейные", "diff": "A"},
        {"q": "Решите: $x^2 + 4x + 4 = 0$", "a": "x = -2", "d": ["x = 2", "x = ±2", "нет корней"], "skill": "G8_ALG_23", "topic": "G8_T03", "name": "Квадратные", "diff": "C"},
        {"q": "Вычислите: $2^3 \\cdot 2^{-1}$", "a": "4", "d": ["2", "8", "1"], "skill": "G8_P09", "topic": "G8_T02", "name": "Степени", "diff": "B"},
        {"q": "Упростите: $(\\sqrt{3})^2$", "a": "3", "d": ["9", "√3", "6"], "skill": "G8_P08", "topic": "G8_T02", "name": "Корни", "diff": "A"},
        {"q": "Площадь круга $r=3$:", "a": "28.26", "d": ["18.84", "9.42", "6.28"], "skill": "G8_GEO_10", "topic": "G8_T04", "name": "Геометрия", "diff": "B"},
        {"q": "Вычислите: $\\sqrt{16} + \\sqrt{9}$", "a": "7", "d": ["5", "25", "12"], "skill": "G8_P08", "topic": "G8_T02", "name": "Корни", "diff": "A"},
        {"q": "Вычислите: $\\frac{3}{4} + \\frac{1}{6}$", "a": "11/12", "d": ["4/10", "1/2", "5/6"], "skill": "G8_P04", "topic": "G8_T01", "name": "Алг. дроби", "diff": "A"},
        {"q": "Решите: $\\frac{x}{3} = 4$", "a": "12", "d": ["7", "1.33", "9"], "skill": "G8_ALG_22", "topic": "G8_T03", "name": "Линейные", "diff": "A"},
        {"q": "$y = x^2$, при $x = -3$, $y =$", "a": "9", "d": ["-9", "6", "-6"], "skill": "G8_P07", "topic": "G8_T02", "name": "Функции", "diff": "A"},
    ],
}


def read_importance(level):
    p = os.path.join(CURRICULUM, f"importance_class{level}.json")
    if not os.path.exists(p):
        return []
    with open(p) as f:
        return json.load(f).get("data", [])


def mk_distractors(correct, variants):
    types = ["sign_error", "arithmetic", "formula"]
    return [
        {"value": v, "error_type": types[i % 3], "explanation": f"Типичная ошибка: {v}", "plausibility": 0.75 - i * 0.1}
        for i, v in enumerate(variants[:3])
    ]


def build_tasks(level):
    templates = TASK_TEMPLATES.get(level, TASK_TEMPLATES[8])
    out = []
    for i, t in enumerate(templates):
        diff = t.get("diff") or ("A" if i < 6 else "B" if i < 14 else "C")
        atype = "equation_solution" if level >= 7 and "x" in t["q"] else "exact_number"
        dm = mk_distractors(t["a"], t["d"])
        out.append({
            "task_id": f"G{level}_DEMO_{i+1:02d}",
            "skill_id": t["skill"],
            "skill_name": t["name"],
            "topic_id": t["topic"],
            "paragraph_id": i + 1,
            "class_level": level,
            "difficulty": diff,
            "question_text": t["q"],
            "question_latex": t["q"],
            "answer_type": atype,
            "correct_answer": t["a"],
            "answer_options": [t["a"]] + t["d"][:3],
            "distractor_meta": dm,
        })
    return out


def build_skill_tree(level):
    data = read_importance(level)
    return [
        {
            "id": c["cluster_id"],
            "name": c["cluster_name"],
            "level": 1,
            "children": [
                {
                    "id": s["node_id"],
                    "name": s["node_id"].replace("_", " "),
                    "level": 2,
                    "children": [{"id": f"{s['node_id']}_L4", "name": f"Задачи — {s['node_id']}", "level": 4}],
                }
                for s in (c.get("subtopics") or [])
            ],
        }
        for c in data
    ]


def write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def load_tasks(level):
    p = os.path.join(ROOT, "fixtures", "tasks", f"class{level}.json")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    return build_tasks(level)


def draft_task_row(t):
    return {
        k: t[k]
        for k in [
            "task_id", "skill_id", "skill_name", "difficulty",
            "question_text", "question_latex", "answer_type",
            "correct_answer", "answer_options", "distractor_meta",
        ]
    } | {"question_image_url": None, "is_template_generated": False}


def main():
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)
    two_h = now - timedelta(hours=2)

    write_json(os.path.join(ROOT, "fixtures", "org.json"), {
        "org": {"id": "org-demo-001", "name": "Школа «Алго» (Демо)", "org_type": "private_school", "city": "Москва", "status": "active"},
        "students": [
            {"id": "stu-demo-001", "first_name": "Алексей", "last_name": "Петров", "class_level": 8, "status": "new"},
            {"id": "stu-demo-002", "first_name": "Мария", "last_name": "Иванова", "class_level": 8, "status": "diagnosed"},
            {"id": "stu-demo-003", "first_name": "Дмитрий", "last_name": "Сидоров", "class_level": 7, "status": "new"},
        ],
        "admin": {"email": "demo@algo.ru", "password": "demo2026", "first_name": "Демо", "last_name": "Администратор", "role": "admin", "org_role": "admin"},
        "teacher": {"email": "teacher@algo.ru", "password": "demo2026", "first_name": "Елена", "last_name": "Учителева", "role": "teacher", "org_role": "teacher"},
    })

    write_json(os.path.join(ROOT, "fixtures", "diagnostics", "invites.json"), [
        {"id": "inv-diag-001", "code": "DIAG01", "student_id": "stu-demo-001", "student_name": "Алексей Петров", "student_first_name": "Алексей", "student_last_name": "Петров", "class_level": 8, "diagnostic_type": "initial", "status": "pending", "org_id": "org-demo-001", "org_name": "Школа «Алго» (Демо)", "expires_at": (now + timedelta(days=1)).isoformat(), "created_at": now.isoformat(), "started_at": None, "completed_at": None, "result": None},
        {"id": "inv-diag-002", "code": "DIAG02", "student_id": "stu-demo-003", "student_name": "Дмитрий Сидоров", "student_first_name": "Дмитрий", "student_last_name": "Сидоров", "class_level": 7, "diagnostic_type": "initial", "status": "confirmed", "org_id": "org-demo-001", "org_name": "Школа «Алго» (Демо)", "expires_at": (now + timedelta(days=1)).isoformat(), "created_at": day_ago.isoformat(), "started_at": None, "completed_at": None, "result": None},
        {"id": "inv-diag-003", "code": "DIAG03", "student_id": "stu-demo-002", "student_name": "Мария Иванова", "student_first_name": "Мария", "student_last_name": "Иванова", "class_level": 8, "diagnostic_type": "initial", "status": "completed", "org_id": "org-demo-001", "org_name": "Школа «Алго» (Демо)", "expires_at": (now + timedelta(days=1)).isoformat(), "created_at": day_ago.isoformat(), "started_at": two_h.isoformat(), "completed_at": now.isoformat(), "cat_session_id": "diag-sess-seed-003", "result": {"theta": 0.42, "accuracy": 0.73, "recommended_level": "at_grade", "total_questions": 15, "correct_answers": 11}},
    ])

    write_json(os.path.join(ROOT, "fixtures", "diagnostics", "report_stu-demo-002.json"), {
        "session_id": "diag-sess-seed-003", "student_id": "stu-demo-002", "grade_level": 8,
        "overall_theta": 0.42, "overall_level": "at_grade", "confidence_interval": [-0.12, 0.96],
        "topic_breakdown": {
            "G8_T01": {"alpha": 0.8, "level": "at_grade", "name": "Алгебраические дроби"},
            "G8_T02": {"alpha": 0.65, "level": "at_grade", "name": "Функция, степень, корень"},
            "G8_T03": {"alpha": 0.55, "level": "at_grade", "name": "Квадратные уравнения"},
            "G8_T04": {"alpha": 0.9, "level": "above_grade", "name": "Геометрия"},
        },
        "weak_skills": ["G8_S24_03", "G8_S08_01"],
        "skill_names": {"G8_S24_03": "Нахождение двух корней", "G8_S08_01": "Арифметический корень", "G8_S02_01": "Алгебраические дроби"},
        "recommended_start": "G8_S24_03", "items_total": 15, "accuracy": 0.73,
        "narrative_ru": "Мария показала устойчивый уровень по геометрии — тема освоена выше программы. В алгебре наблюдается неравномерность: линейные уравнения решает уверенно, однако при работе с квадратными уравнениями и иррациональными корнями допускает типичные ошибки знака.\n\nНаиболее уязвимый блок — квадратные уравнения: в 3 из 4 задач выбиралась ловушка «забытый корень». Рекомендуется начать с повторения дискриминанта.\n\nПрогноз: при целенаправленной работе 2–3 недели Мария выйдет на уровень «выше программы» по алгебре.",
        "distractor_errors": [],
    })

    g7 = load_tasks(7)

    write_json(os.path.join(ROOT, "fixtures", "exams", "seed.json"), {
        "exams": [
            {"exam_id": "EXAM_DEMO_DRAFT", "title": "Черновик: Алгебра 7 класс", "status": "draft", "access_code": None, "total_time_minutes": 45, "variants_count": 1, "tasks_per_variant": 8, "settings": {"time_minutes": 45, "mc_mode": "auto", "class_level": 7}, "skills_covered": list({t["skill_id"] for t in g7[:8]}), "created_at": now.isoformat(), "variants": [{"variant_id": "1", "variant_number": 1, "total_points": 80, "tasks": [draft_task_row(t) for t in g7[:8]]}]},
        ],
        "sessions": [],
    })
    print("Fixtures OK:", ROOT)


if __name__ == "__main__":
    main()
