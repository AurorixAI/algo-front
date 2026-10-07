/**
 * Single dictionary for a student's diagnostic level.
 *
 * The level is decided once by diagnostic-service (level_policy, from theta)
 * and stored by auth-service. Every screen -- report, student card, group card,
 * diagnostics list -- must label and colour it through this file only.
 *
 * Two code sets:
 *   category (CAT): below_grade | at_grade | above_grade
 *   status (5 steps): critical | below | partial_gap | on_level | above
 * Percent correct is a fact about the issued item set, not a level: show it
 * with formatSolved(), never derive a level from it.
 */

export type LevelCategory = "below_grade" | "at_grade" | "above_grade";
export type LevelStatus = "critical" | "below" | "partial_gap" | "on_level" | "above";
export type LevelTone = "rose" | "orange" | "amber" | "emerald" | "violet";

export interface LevelToneClasses {
  /** text colour */
  text: string;
  /** pill / badge: background, border and text */
  badge: string;
  /** light tinted background for icon chips */
  soft: string;
  dot: string;
  ping: string;
  /** SVG ring (currentColor) and its track colour */
  ring: string;
  track: string;
  /** hero card background and border */
  cardBg: string;
  cardBorder: string;
}

// Full class names are listed literally so Tailwind keeps them.
export const LEVEL_TONES: Record<LevelTone, LevelToneClasses> = {
  rose: {
    text: "text-rose-700",
    badge: "bg-rose-100/90 border-rose-200 text-rose-800",
    soft: "bg-rose-50",
    dot: "bg-rose-500",
    ping: "bg-rose-400",
    ring: "text-rose-600",
    track: "#ffe4e6",
    cardBg: "bg-gradient-to-r from-rose-50/90 via-slate-50/40 to-white",
    cardBorder: "border-rose-200/80 shadow-rose-100/50",
  },
  orange: {
    text: "text-orange-700",
    badge: "bg-orange-100/90 border-orange-200 text-orange-800",
    soft: "bg-orange-50",
    dot: "bg-orange-500",
    ping: "bg-orange-400",
    ring: "text-orange-500",
    track: "#ffedd5",
    cardBg: "bg-gradient-to-r from-orange-50/90 via-slate-50/50 to-white",
    cardBorder: "border-orange-200/80 shadow-orange-100/50",
  },
  amber: {
    text: "text-amber-700",
    badge: "bg-amber-100/90 border-amber-200 text-amber-800",
    soft: "bg-amber-50",
    dot: "bg-amber-500",
    ping: "bg-amber-400",
    ring: "text-amber-500",
    track: "#fef3c7",
    cardBg: "bg-gradient-to-r from-amber-50/90 via-slate-50/50 to-white",
    cardBorder: "border-amber-200/80 shadow-amber-100/50",
  },
  emerald: {
    text: "text-emerald-700",
    badge: "bg-emerald-100/90 border-emerald-200 text-emerald-800",
    soft: "bg-emerald-50",
    dot: "bg-emerald-500",
    ping: "bg-emerald-400",
    ring: "text-emerald-500",
    track: "#dcfce7",
    cardBg: "bg-gradient-to-r from-emerald-50/90 via-slate-50/50 to-white",
    cardBorder: "border-emerald-200/80 shadow-emerald-100/50",
  },
  violet: {
    text: "text-violet-700",
    badge: "bg-violet-100/90 border-violet-200 text-violet-800",
    soft: "bg-violet-50",
    dot: "bg-violet-500",
    ping: "bg-violet-400",
    ring: "text-violet-600",
    track: "#ede9fe",
    cardBg: "bg-gradient-to-r from-violet-50/90 via-slate-50/50 to-white",
    cardBorder: "border-violet-200/80 shadow-violet-100/50",
  },
};

export const LEVEL_CATEGORY_META: Record<LevelCategory, { label: string; tone: LevelTone }> = {
  below_grade: { label: "Ниже уровня класса", tone: "orange" },
  at_grade: { label: "На уровне класса", tone: "emerald" },
  above_grade: { label: "Выше уровня класса", tone: "violet" },
};

export const LEVEL_STATUS_META: Record<LevelStatus, { label: string; tone: LevelTone }> = {
  critical: { label: "Критическое отставание", tone: "rose" },
  below: { label: "Ниже уровня класса", tone: "orange" },
  partial_gap: { label: "Частичные пробелы", tone: "amber" },
  on_level: { label: "Соответствует уровню", tone: "emerald" },
  above: { label: "Выше уровня класса", tone: "violet" },
};

export const PROVISIONAL_LABEL = "предварительно";

/** Codes written by older report versions / old UI maps -> current status codes. */
const LEGACY_STATUS: Record<string, LevelStatus> = {
  below_level: "below",
  above_level: "above",
  normal: "on_level",
};

export function normalizeStatus(code?: string | null): LevelStatus | null {
  if (!code) return null;
  if (code in LEVEL_STATUS_META) return code as LevelStatus;
  return LEGACY_STATUS[code] ?? null;
}

export function normalizeCategory(code?: string | null): LevelCategory | null {
  return code && code in LEVEL_CATEGORY_META ? (code as LevelCategory) : null;
}

/** Category implied by a status (same cut-offs: critical/below < -0.5, above >= 1.0). */
export function categoryOfStatus(status: LevelStatus): LevelCategory {
  if (status === "critical" || status === "below") return "below_grade";
  if (status === "above") return "above_grade";
  return "at_grade";
}

/**
 * Same cut-offs as backend level_policy. Only for aggregates that carry no
 * stored level (e.g. a group's average theta); per-student levels come stored.
 */
export function categoryFromTheta(theta: number): LevelCategory {
  if (theta >= 1.0) return "above_grade";
  if (theta >= -0.5) return "at_grade";
  return "below_grade";
}

/** Risk = category below_grade (theta < -0.5), i.e. status critical or below. */
export function isAtRisk(level: { category?: string | null; status?: string | null; theta?: number | null }): boolean {
  const status = normalizeStatus(level.status);
  if (status) return status === "critical" || status === "below";
  const category = normalizeCategory(level.category);
  if (category) return category === "below_grade";
  return level.theta != null && categoryFromTheta(level.theta) === "below_grade";
}

export function levelCategoryLabel(code?: string | null): string | null {
  const c = normalizeCategory(code);
  return c ? LEVEL_CATEGORY_META[c].label : null;
}

export function levelStatusLabel(code?: string | null): string | null {
  const s = normalizeStatus(code);
  return s ? LEVEL_STATUS_META[s].label : null;
}

export function levelCategoryTone(code?: string | null): LevelToneClasses | null {
  const c = normalizeCategory(code);
  return c ? LEVEL_TONES[LEVEL_CATEGORY_META[c].tone] : null;
}

export function levelStatusTone(code?: string | null): LevelToneClasses | null {
  const s = normalizeStatus(code);
  return s ? LEVEL_TONES[LEVEL_STATUS_META[s].tone] : null;
}

/** «решено N из M»; null when the numbers are unknown. */
export function formatSolved(solved?: number | null, total?: number | null): string | null {
  if (solved == null || total == null || total <= 0 || solved < 0) return null;
  return `решено ${solved} из ${total}`;
}

/** Shape of the diagnostic report's `level` object (report_json.level). */
export interface ReportLevel {
  category?: string | null;
  status?: string | null;
  class_equivalent?: string | null;
  provisional?: boolean | null;
  theta?: number | null;
  se?: number | null;
  solved?: number | null;
  total?: number | null;
}

export interface ResolvedLevel {
  category: LevelCategory | null;
  status: LevelStatus | null;
  classEquivalent: string | null;
  provisional: boolean;
  solved: number | null;
  total: number | null;
}

/**
 * Report header level: read report_json.level when present, otherwise the
 * legacy fields (overall.status / overall.class_equivalent / report_meta).
 */
export function resolveReportLevel(report: {
  level?: ReportLevel | null;
  overall?: { status?: string | null; class_equivalent?: string | null } | null;
  report_meta?: { total_questions?: number | null; questions_correct?: number | null } | null;
}): ResolvedLevel {
  const lv = report.level ?? null;
  const status = normalizeStatus(lv?.status) ?? normalizeStatus(report.overall?.status);
  const category = normalizeCategory(lv?.category) ?? (status ? categoryOfStatus(status) : null);
  return {
    category,
    status,
    classEquivalent: lv?.class_equivalent ?? report.overall?.class_equivalent ?? null,
    provisional: lv?.provisional === true,
    solved: lv?.solved ?? report.report_meta?.questions_correct ?? null,
    total: lv?.total ?? report.report_meta?.total_questions ?? null,
  };
}

/** Level fields as returned by auth-service for a diagnostic result. */
export interface StoredLevelFields {
  recommended_level?: string | null;
  level_status?: string | null;
  class_equivalent?: string | null;
  level_provisional?: boolean | null;
}

/**
 * Label for lists and cards: the 5-step status when known, else the CAT
 * category; null (render a dash) when the level is unknown. Never invents
 * a default such as "Средний".
 */
export function storedLevelDisplay(
  res?: StoredLevelFields | null,
): { label: string; tone: LevelToneClasses; provisional: boolean; classEquivalent: string | null } | null {
  if (!res) return null;
  const status = normalizeStatus(res.level_status);
  const category = normalizeCategory(res.recommended_level);
  const label = (status && levelStatusLabel(status)) || (category && levelCategoryLabel(category));
  const tone = (status && levelStatusTone(status)) || (category && levelCategoryTone(category));
  if (!label || !tone) return null;
  return {
    label,
    tone,
    provisional: res.level_provisional === true,
    classEquivalent: res.class_equivalent ?? null,
  };
}
