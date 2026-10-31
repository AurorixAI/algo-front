"""A stand-in for content-service's READ API, for the E2E stack (stdlib only).

exam-service takes its tasks, textbooks and skills from content-service over HTTP (/api/v1/content/*). The real
service needs the digitised task bank; the exam scenarios only need a few valid multiple-choice tasks with known
answers, so this stub serves exactly those. The shape of a task is the one of content-service's `_task_row_full`.

Seed (also described in e2e/support/exam.ts, which mirrors it):
  skill   E2E-SK-1  "Сложение"       toc 9001 "§1 Сложение"   textbook 00000000-0000-0000-0000-0000000e2e01
  tasks   E2E-T1 .. E2E-T5   "Найдите сумму чисел <a> и <b> (словами)."  key = a + b  (3 distractors each)
"""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote, urlparse

TEXTBOOK_ID = "00000000-0000-0000-0000-0000000e2e01"
SKILL_ID = "E2E-SK-1"
TOC_ID = 9001

# (a, b, words): the answer is a + b; distractors are the typical slips (a - b, a * b, a + b + 1).
# The question is worded without digits: the front wraps bare numbers into KaTeX, which is invisible to the
# accessibility tree, and the tests find a question by its text.
PAIRS = [
    (3, 4, "Найдите сумму чисел три и четыре"),
    (8, 5, "Найдите сумму чисел восемь и пять"),
    (6, 7, "Найдите сумму чисел шесть и семь"),
    (9, 9, "Найдите сумму чисел девять и девять"),
    (12, 5, "Найдите сумму чисел двенадцать и пять"),
]


def make_task(index, a, b, words):
    key = a + b
    options = [str(key), str(abs(a - b)), str(a * b), str(key + 1)]
    # keep the options distinct (a - b or a * b may coincide with the key or with each other)
    seen, unique = set(), []
    for value in options + [str(key + 2), str(key + 3), str(key + 4)]:
        if value not in seen:
            seen.add(value)
            unique.append(value)
    options = unique[:4]
    distractors = [
        {"value": value, "explanation": f"Ошибка: получено {value} вместо {key}"}
        for value in options
        if value != str(key)
    ]
    return {
        "id": f"E2E-T{index}",
        "task_id": f"E2E-T{index}",
        "skill_id": SKILL_ID,
        "skill_name": "Сложение",
        "difficulty": "B",
        "question_text": f"{words}.",
        "question_latex": None,
        "answer_type": "exact_number",
        "correct_answer": str(key),
        "correct_answer_latex": "",
        "answer_options": options,
        "answer_options_latex": None,
        "distractor_meta": distractors,
        "irt_discrimination": 1.0,
        "irt_difficulty": 0.0,
        "irt_guessing": 0.0,
        "verification_status": "verified",
        "latex_status": "ok",
        "is_active": True,
        "content_quality": {},
        "question_image_url": None,
        "attested_fields": [],
    }


TASKS = [make_task(i + 1, a, b, words) for i, (a, b, words) in enumerate(PAIRS)]
BY_ID = {t["id"]: t for t in TASKS}

# A second skill with 20 tasks (wave B P1): percentages in steps of 5 % (55 %, 75 %) need a 20-task exam. The task i is
# "Прибавьте 100 к числу i", the key is 100 + i. They are served ONLY for skill E2E-S2-SK: the five tasks above and every
# scenario that uses them stay as they were.
SKILL2_ID = "E2E-SK-2"
TASKS2 = []
for _i in range(1, 21):
    _task = make_task(_i, 100, _i, f"Прибавьте 100 к числу {_i}")
    _task.update(id=f"E2E-S2-{_i}", task_id=f"E2E-S2-{_i}", skill_id=SKILL2_ID, skill_name="Сложение со ста", question_text=f"Прибавьте 100 к числу {_i}.")
    TASKS2.append(_task)
    BY_ID[_task["id"]] = _task

# The skill tree the create form shows: level 1 > level 2 > the selectable skill (level 3, the one the tasks belong to)
def _group(node_id, level, parent_id, name):
    return {
        "id": node_id, "level": level, "parent_id": parent_id, "name_ru": name, "description": "E2E",
        "class_level_start": 1, "class_level_end": 11, "sequence_order": 1, "importance": 5,
        "cognitive_type": "procedural", "is_active": True, "example_task": None,
        "assessed_ability": None, "difficulty_level": None, "formula": None, "tasks_count": 5,
    }


SKILL_GROUPS = [_group("E2E-L1", 1, None, "Арифметика"), _group("E2E-L2", 2, "E2E-L1", "Сложение чисел")]
SKILL = {
    "id": SKILL_ID, "level": 3, "parent_id": "E2E-L2", "tasks_count": 5, "name_ru": "Сложение", "description": "E2E",
    "class_level_start": 1, "class_level_end": 11, "sequence_order": 1, "importance": 5,
    "cognitive_type": "procedural", "is_active": True, "example_task": None,
    "assessed_ability": None, "difficulty_level": None, "formula": None,
}
TEXTBOOK = {
    "textbook_id": TEXTBOOK_ID, "title": "E2E: Математика", "subtitle": None, "authors": ["E2E"],
    "class_level": 7, "subject": "math", "publisher": None, "year": 2026, "total_tasks": len(TASKS),
    "digitized_tasks": len(TASKS), "is_active": True,
}
TOC = [{
    "id": TOC_ID, "textbook_id": TEXTBOOK_ID, "level": 1, "number": "1", "title": "Сложение",
    "parent_id": None, "page_start": 1, "page_end": 2, "sequence_order": 1,
    "task_count": len(TASKS), "digitized_count": len(TASKS),
}]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):  # quiet
        pass

    def _send(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        path, query = url.path, parse_qs(url.query)
        if path == "/health":
            return self._send({"status": "ok"})
        base = "/api/v1/content"
        if not path.startswith(base):
            return self._send({"detail": "not found"}, 404)
        path = path[len(base):]
        if path == "/tasks":
            skills = query.get("skill_ids") or []
            tocs = [int(x) for x in query.get("toc_ids") or []]
            excluded = set(query.get("exclude_ids") or [])
            limit = int((query.get("limit") or ["50"])[0])
            pool = TASKS2 if SKILL2_ID in skills else TASKS
            rows = [
                t for t in pool
                if t["id"] not in excluded
                and (not skills or t["skill_id"] in skills)
                and (not tocs or TOC_ID in tocs)
            ]
            return self._send(rows[:limit])
        match = re.fullmatch(r"/tasks/(.+)", path)
        if match:
            task = BY_ID.get(unquote(match.group(1)))
            return self._send(task, 200) if task else self._send({"detail": "not found"}, 404)
        if path == "/textbooks":
            return self._send([TEXTBOOK])
        if re.fullmatch(r"/textbooks/[^/]+", path):
            return self._send(TEXTBOOK)
        if re.fullmatch(r"/textbooks/[^/]+/toc", path):
            return self._send(TOC)
        if re.fullmatch(r"/textbooks/[^/]+/coverage", path):
            return self._send([{"id": TOC_ID, "level": 1, "number": "1", "title": "Сложение", "total": len(TASKS), "digitized": len(TASKS)}])
        if re.fullmatch(r"/toc/\d+/skills", path):
            return self._send([{"id": SKILL_ID, "name_ru": "Сложение", "role": "main", "confidence": 1.0, "is_main": True}])
        if path == "/skills":
            return self._send([*SKILL_GROUPS, SKILL])
        match = re.fullmatch(r"/skills/(.+)", path)
        if match and unquote(match.group(1)) == SKILL_ID:
            return self._send(SKILL)
        return self._send({"detail": "not found"}, 404)

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        path = urlparse(self.path).path
        if path == "/api/v1/content/toc/expand":
            return self._send(sorted(set(body.get("toc_ids") or [])))
        if path == "/api/v1/content/tasks/avg-difficulty":
            return self._send({SKILL_ID: 0.0})
        return self._send({"detail": "not found"}, 404)


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", 8004), Handler).serve_forever()
