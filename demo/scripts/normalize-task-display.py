#!/usr/bin/env python3
"""Normalize demo task fixtures for clean KaTeX display + full MC options."""
from __future__ import annotations

import json
import os
import re

ROOT = os.path.join(os.path.dirname(__file__), "..")
FIXTURES = os.path.join(ROOT, "fixtures", "tasks")


def subpart_index(task_id: str) -> int | None:
    m = re.search(r"\.(\d+)$", task_id)
    return int(m.group(1)) if m else None


def extract_numbered_part(text: str, index: int | None) -> str:
    if not index or index < 1:
        return text
    m = re.search(rf"{index}[\).]\s*([^;\n]+)", text, re.I)
    if m:
        return m.group(1).strip()
    chunks = re.split(r";\s*(?=\d+[\).])", text)
    if len(chunks) >= index:
        return re.sub(r"^\d+[\).]\s*", "", chunks[index - 1]).strip()
    return text


def wrap_equation(expr: str) -> str:
    e = expr.strip()
    e = re.sub(r",(\d)", r".\1", e)
    e = re.sub(r"\^(\d+)", r"^{\1}", e)
    e = re.sub(r"\^([a-zA-Z])", r"^{\1}", e)
    return f"${e}$"


def wrap_bare_math(text: str) -> str:
    s = text.replace("\\\\", "\n").strip()
    if re.search(r"\$[^$]+\$", s):
        return s
    s = re.sub(r"\\sqrt\{[^}]+\}", lambda m: f"${m.group(0)}$", s)
    s = re.sub(r"\\frac\{[^}]+\}\{[^}]+\}", lambda m: f"${m.group(0)}$", s)
    eq = re.search(
        r"([\d.,]*\s*[a-zA-Z]?(?:\^\{?[^}\s]+)?(?:\s*[\+\-·\*\/]\s*[\d.,a-zA-Z^{}()\\sqrt\s]+)+\s*=\s*[\d.,a-zA-Z^{}()\\sqrt\s+\-]+)",
        s,
    )
    if eq:
        return s.replace(eq.group(1), wrap_equation(eq.group(1)))
    return s


def pick_display(task: dict) -> str:
    source = (task.get("question_latex") or task.get("question_text") or "").strip()
    idx = subpart_index(task.get("task_id", ""))
    part = extract_numbered_part(source, idx)
    if ";" in part and re.search(r"\d+[\).]\s*\$", part):
        part = re.split(r";\s*(?=\d+[\).])", part)[0]
        part = re.sub(r"^\d+[\).]\s*", "", part).strip()
    part = re.sub(r"^Решите\s+уравнени[ея]:\s*", "", part, flags=re.I).strip()
    if "=" in part and not part.startswith("$"):
        return f"Решите уравнение: {wrap_bare_math(part)}"
    return wrap_bare_math(part)


def mc_options(task: dict) -> list[str]:
    correct = task.get("correct_answer", "")
    dist = [d["value"] for d in (task.get("distractor_meta") or []) if d.get("value")]
    opts: list[str] = []
    seen: set[str] = set()
    for v in [correct, *dist]:
        if v and v not in seen:
            opts.append(v)
            seen.add(v)
    return opts[:4]


INTERNAL_ERROR_TYPES = {
    "ai_generated": "common_mistake",
    "ai_numeric": "magnitude_error",
    "conceptual_error": "common_mistake",
}

PEDAGOGY_LABELS = [
    "sign_error",
    "arithmetic",
    "formula",
    "common_mistake",
    "magnitude_error",
    "wrong_operation",
]


def sanitize_distractors(task: dict) -> dict:
    meta = task.get("distractor_meta") or []
    for i, d in enumerate(meta):
        et = d.get("error_type", "")
        if et in INTERNAL_ERROR_TYPES:
            d["error_type"] = INTERNAL_ERROR_TYPES[et]
        elif et.startswith("ai_"):
            d["error_type"] = PEDAGOGY_LABELS[i % len(PEDAGOGY_LABELS)]
    task["distractor_meta"] = meta
    return task


def normalize_task(task: dict) -> dict:
    display = pick_display(task)
    if task.get("answer_type") == "equation_solution" and display.startswith("$"):
        display = f"Решите уравнение: {display}"
    task["question_text"] = display
    task["question_latex"] = display
    opts = mc_options(task)
    if len(opts) >= 2:
        task["answer_options"] = opts
    return sanitize_distractors(task)


def main() -> None:
    for level in range(5, 9):
        path = os.path.join(FIXTURES, f"class{level}.json")
        if not os.path.exists(path):
            continue
        with open(path, encoding="utf-8") as f:
            tasks = json.load(f)
        tasks = [normalize_task(t) for t in tasks]
        with open(path, "w", encoding="utf-8") as f:
            json.dump(tasks, f, ensure_ascii=False, indent=2)
        print(f"  normalized {len(tasks)} tasks → {path}")
    print("Done. Run: python3 demo/scripts/build-fixtures.py")


if __name__ == "__main__":
    main()
