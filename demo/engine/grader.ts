import type { DemoTask, DistractorMeta } from "../types";

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/,/g, ".")
    .replace(/\\pm/g, "±")
    .replace(/\\sqrt\{([^}]+)\}/g, "√$1")
    .replace(/\*/g, "·");
}

function numericClose(a: string, b: string, eps = 0.01): boolean {
  const fa = parseFloat(a.replace(/[^\d.\-+]/g, ""));
  const fb = parseFloat(b.replace(/[^\d.\-+]/g, ""));
  if (!Number.isNaN(fa) && !Number.isNaN(fb)) return Math.abs(fa - fb) < eps;
  return false;
}

export function checkAnswer(
  task: Pick<DemoTask, "correct_answer" | "distractor_meta" | "answer_options">,
  studentAnswer: string,
): { is_correct: boolean; eval_category: "correct" | "distractor" | "wrong" | "idk"; distractor_hit?: DistractorMeta | null } {
  const ans = studentAnswer.trim();
  if (!ans || ans === "?" || ans.toLowerCase() === "не знаю") {
    return { is_correct: false, eval_category: "idk" };
  }

  const correct = task.correct_answer;
  const na = normalize(ans);
  const nc = normalize(correct);

  if (na === nc) return { is_correct: true, eval_category: "correct" };

  // Multi-root answers: compare sets
  const splitAns = na.split(/[;]/).map((x) => x.trim()).filter(Boolean);
  const splitCor = nc.split(/[;]/).map((x) => x.trim()).filter(Boolean);
  if (splitAns.length > 1 && splitCor.length > 1) {
    const sortedA = [...splitAns].sort().join("|");
    const sortedC = [...splitCor].sort().join("|");
    if (sortedA === sortedC) return { is_correct: true, eval_category: "correct" };
  }

  if (numericClose(ans, correct)) return { is_correct: true, eval_category: "correct" };

  for (const d of task.distractor_meta ?? []) {
    if (normalize(d.value) === na || numericClose(ans, d.value)) {
      return { is_correct: false, eval_category: "distractor", distractor_hit: d };
    }
  }

  for (const opt of task.answer_options ?? []) {
    if (opt !== correct && (normalize(opt) === na || numericClose(ans, opt))) {
      const hit = task.distractor_meta?.find((d) => normalize(d.value) === normalize(opt));
      return { is_correct: false, eval_category: "distractor", distractor_hit: hit ?? null };
    }
  }

  return { is_correct: false, eval_category: "wrong" };
}

export function thetaToLevel(theta: number): string {
  if (theta >= 1.0) return "above_grade";
  if (theta >= -0.5) return "at_grade";
  return "below_grade";
}

export function thetaToLevelRu(theta: number): string {
  if (theta >= 1.0) return "Выше программы";
  if (theta >= -0.5) return "Соответствует программе";
  return "Ниже программы";
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildMcOptions(task: DemoTask): string[] {
  const distractors = (task.distractor_meta ?? [])
    .map((d) => d.value)
    .filter((v) => v && v !== task.correct_answer);
  const unique = new Set<string>([task.correct_answer, ...distractors]);
  const opts = shuffle(Array.from(unique));
  while (opts.length < 4 && distractors.length > 0) {
    const extra = distractors[opts.length % distractors.length];
    if (!opts.includes(extra)) opts.push(extra);
    else break;
  }
  return opts.slice(0, 4);
}
