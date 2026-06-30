#!/usr/bin/env python3
"""
Export real curriculum fixtures from content-postgres for demo mode.

Requires: docker container `content-postgres` running with algo_content DB.

Usage:
    python3 demo/scripts/export-from-db.py
"""
from __future__ import annotations

import json
import os
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
FIXTURES = os.path.join(ROOT, "fixtures")
PSQL = [
    "docker",
    "exec",
    "content-postgres",
    "psql",
    "-U",
    "algo",
    "-d",
    "algo_content",
    "-t",
    "-A",
]


def psql_json(sql: str):
    wrapped = f"SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM ({sql}) t;"
    proc = subprocess.run(PSQL + ["-c", wrapped], capture_output=True, text=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr or proc.stdout)
    raw = proc.stdout.strip()
    return json.loads(raw) if raw else []


def write_json(path: str, data) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  wrote {path}")


def load_parent_map() -> dict[str, str | None]:
    rows = psql_json(
        "SELECT id, parent_id FROM knowledge_hierarchy WHERE is_active = TRUE"
    )
    return {r["id"]: r.get("parent_id") for r in rows}


def topic_id_for_skill(skill_id: str, parents: dict[str, str | None]) -> str:
    cur = skill_id
    seen: set[str] = set()
    while cur and cur not in seen:
        seen.add(cur)
        row_level = skill_levels.get(cur)
        if row_level == "L3":
            return cur
        cur = parents.get(cur) or ""
    return skill_id


def export_skills():
    print("Skills (knowledge_hierarchy L1–L4)…")
    for cl in range(5, 9):
        rows = psql_json(f"""
            SELECT kh.id, kh.level, kh.name_ru, kh.parent_id,
                   kh.class_level_start, kh.class_level_end,
                   kh.importance, kh.sequence_order,
                   COUNT(tm.id)::int AS tasks_count
            FROM knowledge_hierarchy kh
            LEFT JOIN tasks_master tm
              ON tm.skill_id = kh.id AND tm.is_active = TRUE
            WHERE kh.is_active = TRUE
              AND (kh.class_level_start IS NULL OR kh.class_level_start <= {cl})
              AND (kh.class_level_end   IS NULL OR kh.class_level_end   >= {cl})
            GROUP BY kh.id, kh.level, kh.name_ru, kh.parent_id,
                     kh.class_level_start, kh.class_level_end,
                     kh.importance, kh.sequence_order
            ORDER BY kh.sequence_order, kh.id
        """)
        write_json(os.path.join(FIXTURES, "skills", f"class{cl}.json"), rows)


def export_textbooks():
    print("Textbooks…")
    all_books = psql_json("""
        SELECT textbook_id, title, subtitle, authors, class_level,
               publisher, digitization_status,
               digitization_progress::float AS digitization_progress,
               tasks_extracted, cover_image_url
        FROM textbooks
        WHERE is_active = TRUE AND class_level BETWEEN 5 AND 8
        ORDER BY class_level, title
    """)
    by_class: dict[int, list] = {5: [], 6: [], 7: [], 8: []}
    for b in all_books:
        cl = b["class_level"]
        if cl in by_class:
            by_class[cl].append(b)
    for cl, books in by_class.items():
        write_json(os.path.join(FIXTURES, "textbooks", f"class{cl}.json"), books)


def export_toc():
    print("TOC (flat, keyed by textbook_id)…")
    rows = psql_json("""
        SELECT t.textbook_id,
               toc.id, toc.parent_id,
               toc.level::text AS node_type,
               COALESCE(NULLIF(toc.display_number, ''), toc.number) AS display_number,
               COALESCE(NULLIF(toc.display_name, ''), toc.title) AS display_name,
               toc.title AS full_title,
               toc.page_start, toc.page_end, toc.sort_order,
               toc.mapped_skill_id, toc.mapped_topic_id,
               COALESCE(toc.mapping_confidence, 0)::float AS mapping_confidence,
               COUNT(tm.id)::int AS tasks_count
        FROM textbook_toc toc
        JOIN textbooks t ON t.textbook_id = toc.textbook_id
        LEFT JOIN tasks_master tm
          ON tm.toc_id = toc.id AND tm.is_active = TRUE
        WHERE t.is_active = TRUE AND t.class_level BETWEEN 5 AND 8
        GROUP BY t.textbook_id, toc.id, toc.parent_id, toc.level,
                 toc.display_number, toc.number, toc.display_name, toc.title,
                 toc.page_start, toc.page_end, toc.sort_order,
                 toc.mapped_skill_id, toc.mapped_topic_id, toc.mapping_confidence
        ORDER BY t.textbook_id, toc.sort_order, toc.id
    """)
    by_book: dict[str, list] = {}
    for r in rows:
        tb = r.pop("textbook_id")
        by_book.setdefault(tb, []).append(r)
    write_json(os.path.join(FIXTURES, "textbooks", "toc-by-id.json"), by_book)


def normalize_task(row: dict, parents: dict[str, str | None], cl: int) -> dict:
    opts = row.get("answer_options") or []
    if isinstance(opts, str):
        opts = json.loads(opts)
    meta = row.get("distractor_meta") or []
    if isinstance(meta, str):
        meta = json.loads(meta)
    skill_id = row["skill_id"]
    return {
        "task_id": row["task_id"],
        "skill_id": skill_id,
        "skill_name": row.get("skill_name") or skill_id,
        "topic_id": topic_id_for_skill(skill_id, parents),
        "paragraph_id": row.get("toc_id"),
        "class_level": cl,
        "difficulty": row.get("difficulty") or "B",
        "question_text": row["question_text"],
        "question_latex": row.get("question_latex") or row["question_text"],
        "answer_type": row.get("answer_type") or "exact_number",
        "correct_answer": row["correct_answer"],
        "answer_options": opts if isinstance(opts, list) else [],
        "distractor_meta": meta if isinstance(meta, list) else [],
    }


def export_tasks(parents: dict[str, str | None]):
    print("Tasks (verified, up to 80 per class)…")
    for cl in range(5, 9):
        rows = psql_json(f"""
            SELECT tm.id AS task_id, tm.skill_id, kh.name_ru AS skill_name,
                   tm.toc_id, tm.question_text, tm.question_latex,
                   tm.answer_type, tm.correct_answer,
                   tm.answer_options, tm.distractor_meta, tm.difficulty
            FROM tasks_master tm
            JOIN knowledge_hierarchy kh ON kh.id = tm.skill_id
            WHERE tm.is_active = TRUE
              AND tm.verification_status = 'verified'
              AND kh.class_level_start <= {cl}
              AND kh.class_level_end >= {cl}
            ORDER BY RANDOM()
            LIMIT 80
        """)
        tasks = [normalize_task(r, parents, cl) for r in rows]
        # Ensure MC options exist for equation types
        for t in tasks:
            if not t["answer_options"]:
                t["answer_options"] = [t["correct_answer"]]
        write_json(os.path.join(FIXTURES, "tasks", f"class{cl}.json"), tasks)


skill_levels: dict[str, str] = {}


def main() -> int:
    print("Exporting demo fixtures from content-postgres…\n")
    try:
        subprocess.run(
            ["docker", "exec", "content-postgres", "pg_isready", "-U", "algo"],
            capture_output=True,
            check=True,
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("ERROR: content-postgres container is not running.", file=sys.stderr)
        return 1

    global skill_levels
    skill_levels = {
        r["id"]: r["level"]
        for r in psql_json(
            "SELECT id, level FROM knowledge_hierarchy WHERE is_active = TRUE"
        )
    }
    parents = load_parent_map()

    export_skills()
    export_textbooks()
    export_toc()
    export_tasks(parents)

    print("\nDone. Run: cd algo-front && npm run sync-demo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
