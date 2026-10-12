"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LEVEL_TONES, PROVISIONAL_LABEL, formatSolved, levelStatusLabel, levelStatusTone, resolveReportLevel,
  type LevelToneClasses, type ReportLevel,
} from "@/lib/diagnostic-level";
import {
  PLAN_NOT_BUILT_TEXT, PLAN_NOT_NEEDED_TEXT, SKILLS_EMPTY_TEXT,
  hasBoundaryData, hoursLabel, isDevelopmentStep, isErrorFreeReport, knownPlanHours, loadErrorInfo, nextReportPollStep,
  normalizeReportJson, recommendedStartName, reportAchievements, reportMetaInfo, reportScorePercent,
  reportWrongCount, stepHours, tabContentState,
} from "@/lib/diagnostic-report";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  X,
  Users,
  Clock,
  AlertOctagon,
  ListChecks,
  Award,
  FileText,
  HelpCircle,
  Sparkles,
  GitBranch,
  Brain,
  ShieldAlert,
  Anchor,
  Lock,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Target,
  Compass,
  Flag,
  Zap,
  User,
  Info,
} from "lucide-react";

import { analyticsApi, orgApi } from "@/lib/api";
import { AssignGroupModal } from "@/components/groups/assign-group-modal";
import { MathRenderer } from "@/components/ui/math-renderer";
import { TaskStatement } from "@/components/ui/task-statement";
import { pickAnswerDisplayText } from "@/lib/task-display";
import "katex/dist/katex.min.css";

// ─── Types ────────────────────────────────────────────────────────────────────

type ReportTab = "journal" | "skills" | "plan";
const REPORT_TABS: ReportTab[] = ["journal", "skills", "plan"];

interface InviteInfo {
  id: string; code: string; student_name: string; student_id?: string;
  session_id?: string | null;
  class_level: number; diagnostic_type: string; status: string;
  student_status?: string; completed_at: string | null;
  result?: { theta?: number; accuracy?: number; total_questions?: number; correct_answers?: number };
}

interface StrongSkill { skill_id: string; skill_name_ru: string; mastery_percent: number; }
interface WeakSkill   { skill_id: string; skill_name_ru: string; mastery_percent: number; status: string; }
interface CriticalGap { skill_id: string; skill_name_ru: string; mastery_percent: number; priority: number; }
interface ErrorPattern {
  task_id: string;
  skill_id: string; skill_name_ru: string;
  question_text?: string | null;
  question_latex?: string | null;
  answer_type?: string | null;
  answer_options?: string[];
  answer_options_latex?: string[];
  eval_category?: string;
  student_answer?: string | null;
  student_answer_latex?: string | null;
  correct_answer?: string | null;
  correct_answer_latex?: string | null;
  distractor_explanation?: string | null;
  distractor_explanation_latex?: string | null;
}
interface ActionItem {
  priority: number; skill_name_ru: string;
  skill_id?: string;
  action_title: string; full_description: string;
  /** Present only when the report has a real basis for a duration; never invented. */
  estimated_hours?: number | null;
  /** "development" = next growth step of an error-free attempt (no deficit implied). */
  kind?: "development" | string | null;
}
interface Achievement { skill_id: string; skill_name_ru: string; correct_answers?: number; mastery_percent?: number; }

interface ChainStep {
  step_num?: number;
  grade: number;
  skill_id: string;
  skill_name_ru: string;
  task_id: string;
  phase?: string;
  is_deep_scan?: boolean;
  outcome: number;
  eval_category?: string;
  question_text?: string | null;
  question_latex?: string | null;
  student_answer?: string | null;
  student_answer_latex?: string | null;
  correct_answer?: string | null;
  correct_answer_latex?: string | null;
  distractor_explanation?: string | null;
}

interface RootCauseChain {
  source_grade: number;
  source_skill_id: string;
  source_skill_name: string;
  root_gap_grade: number;
  root_gap_skill_id: string;
  root_gap_skill_name: string;
  root_gap_explanation?: string | null;
  anchor_grade?: number | null;
  anchor_skill_id?: string | null;
  anchor_skill_name?: string | null;
  severity: "critical" | "warning" | "local_gap";
  steps_count: number;
  steps: ChainStep[];
}

interface DiagnosticBoundary {
  anchor_level: string;
  anchor_skills: string[];
  breakpoint_level: string;
  breakpoint_skills: string[];
  blocked_level: string;
  blocked_skills: string[];
}

interface CognitiveErrorCluster {
  category: string;
  title: string;
  description: string;
  count: number;
  examples: Array<{
    task_id: string;
    skill_id: string;
    skill_name_ru: string;
    question_text?: string | null;
    question_latex?: string | null;
    student_answer?: string | null;
    student_answer_latex?: string | null;
    correct_answer?: string | null;
    correct_answer_latex?: string | null;
    distractor_explanation?: string | null;
    distractor_explanation_latex?: string | null;
  }>;
}

/**
 * Shape of report_json after normalizeReportJson(): lists are always lists and
 * report_meta / overall are always objects, but old reports may lack any scalar.
 */
interface ReportJson {
  report_meta: {
    session_id?: string; student_name?: string; class_level?: number;
    test_code?: string;
    /** Date of the attempt (not of the rebuild). */
    date?: string | null;
    /** Date the report was built. */
    generated_on?: string | null;
    total_questions?: number | null;
    questions_correct?: number | null; score_percent?: number | null;
    /** Every answer correct and nothing to correct (schema 5). */
    error_free?: boolean;
    /** Reasons part of the reference data was unavailable at build time. */
    degraded?: string[] | null;
  };
  overall: {
    score_percent?: number | null; status?: string; status_label_ru?: string;
    student_summary?: string | null;
  };
  /** New contract (report_json.level); absent in reports built before it. */
  level?: ReportLevel | null;
  diagnostic_boundary?: DiagnosticBoundary;
  root_cause_chains?: RootCauseChain[];
  cognitive_error_types?: CognitiveErrorCluster[];
  /** Topics solved without a single wrong attempt (schema 5). */
  achievements?:  Achievement[];
  /** The one recommended start == first plan step (schema 5). */
  recommended_start?: { skill_id?: string | null; skill_name_ru?: string | null; evidence?: string | null } | null;
  strong_skills:  StrongSkill[];
  weak_skills:    WeakSkill[];
  critical_gaps:  CriticalGap[];
  error_patterns: ErrorPattern[];
  action_plan:    ActionItem[];
}

// ─── Config ───────────────────────────────────────────────────────────────────

// Level colours come from the shared dictionary (src/lib/diagnostic-level.ts).
const NEUTRAL_TONE: LevelToneClasses = {
  text: "text-slate-700",
  badge: "bg-slate-100 border-slate-200 text-slate-700",
  soft: "bg-slate-50",
  dot: "bg-slate-400",
  ping: "bg-slate-300",
  ring: "text-slate-400",
  track: "#e2e8f0",
  cardBg: "bg-gradient-to-r from-slate-50 via-white to-white",
  cardBorder: "border-slate-200/80",
};
// A report without a known level is shown neutral, never as a good (green) level.
const toneForStatus = (status?: string | null): LevelToneClasses =>
  levelStatusTone(status) ?? NEUTRAL_TONE;

const SKILL_STATUS_CFG = {
  developing: { label: "Развивается", bar: "bg-amber-400",  text: "text-amber-700",  bg: "bg-amber-50/60"  },
  unstable:   { label: "Нестабильно", bar: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50/60" },
  gap:        { label: "Пробел",      bar: "bg-red-400",    text: "text-red-700",    bg: "bg-red-50/60"    },
};

const EVAL_CATEGORY_CFG: Record<string, { label: string; color: string }> = {
  distractor: { label: "Дистрактор",      color: "bg-amber-100 text-amber-700"  },
  wrong:      { label: "Неверный ответ",  color: "bg-red-100 text-red-700"      },
  idk:        { label: "Не знал",         color: "bg-slate-100 text-slate-600"  },
  correct:    { label: "Верно",           color: "bg-emerald-100 text-emerald-700" },
};

// A robust comparison key for math & text options: normalizes LaTeX macros, empty sets, and Unicode symbols
// (\dfrac, \frac, \sqrt, \left, \right, \emptyset, commas, $, spaces, minuses, \infty, \leq, \geq, \neq, \in, \cup, \cap, \mathbb, \approx, \Delta, \setminus, ^{...}, _{...})
// to reliably highlight the student's chosen answer and the correct answer without false fallback banners.
function canonicalAnswerKey(value: string | null | undefined): string {
  let s = (value || "").trim();
  if (!s) return "";
  // 1. Strip outer and inline LaTeX math delimiters
  s = s.replace(/\$\$/g, "").replace(/\$/g, "");
  // 2. Normalize mathematical minuses and dashes (U+2212, U+2013, U+2014) to standard hyphen
  s = s.replace(/\u2212/g, "-").replace(/\u2013/g, "-").replace(/\u2014/g, "-");
  
  // 3. Strip structural modifiers FIRST (\left, \right, \displaystyle, \limits, \text{...})
  s = s.replace(/\\?(?:left|right|displaystyle|limits)\b/g, "");
  s = s.replace(/\\?text\s*\{([^{}]*)\}/g, "$1");
  
  // 4. Empty set & no solution normalization
  s = s.replace(/\\?(?:emptyset|varnothing|empty)\b|[∅⌀Ø]/g, "emptyset");
  s = s.replace(/нет\s*(?:действительных\s*)?(?:корней|решений)|(?:корней|решений)\s*нет/gi, "emptyset");
  
  // 5. Simplify single-level exponents and subscripts before fractions to avoid nested braces
  // e.g. e^{x} -> e^x, x_{0} -> x_0, a^{2} -> a^2
  while (/\^\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\^\{([^{}]+)\}/g, "^$1");
  }
  while (/_\{([^{}]+)\}/.test(s)) {
    s = s.replace(/_\{([^{}]+)\}/g, "_$1");
  }
  
  // 6. Roots: \sqrt{x} -> sqrt(x), \sqrt[n]{x} -> (x)^(1/n)
  while (/\\?sqrt\s*\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\?sqrt\s*\{([^{}]+)\}/g, "sqrt($1)");
  }
  s = s.replace(/\\?sqrt/g, "sqrt").replace(/√/g, "sqrt");
  
  // 7. Fractions: recursively resolve \frac{num}{den} and \dfrac{num}{den}
  while (/\\?(?:dfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/.test(s)) {
    s = s.replace(/\\?(?:dfrac|frac)\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, "($1)/($2)");
  }
  s = s.replace(/\\?(?:dfrac|frac)\b/g, "/");
  
  // 8. Inequalities, approximations, set operations, and relations
  s = s.replace(/\\?(?:approx|thickapprox|sim|simeq)\b|≈|~/g, "≈");
  s = s.replace(/\\?(?:Delta|delta)\b|Δ|δ/g, "Δ");
  s = s.replace(/\\?(?:prime)\b|'/g, "'");
  s = s.replace(/\\?(?:leq|le)\b|≤/g, "<=");
  s = s.replace(/\\?(?:geq|ge)\b|≥/g, ">=");
  s = s.replace(/\\?(?:neq|ne)\b|≠/g, "!=");
  s = s.replace(/\\?notin\b|∉/g, "!in");
  s = s.replace(/\\?(?:setminus|backslash)\b|\\/g, "\\");
  s = s.replace(/\\?in\b|∈/g, "in");
  s = s.replace(/\\?infty\b|∞/g, "inf");
  s = s.replace(/\\?cup\b|∪/g, "U");
  s = s.replace(/\\?cap\b|∩/g, "cap");
  s = s.replace(/\\?(?:cdot|times)\b|\*|·/g, "");
  s = s.replace(/\\?mathbb\{R\}|\\?mathbb\s+R|ℝ/g, "R");
  s = s.replace(/\\?mathbb\{Z\}|\\?mathbb\s+Z|ℤ/g, "Z");
  s = s.replace(/\\?mathbb\{Q\}|\\?mathbb\s+Q|ℚ/g, "Q");
  s = s.replace(/\\?mathbb\{N\}|\\?mathbb\s+N|ℕ/g, "N");
  s = s.replace(/\\?pi\b|π/g, "pi");
  s = s.replace(/\^?\\?circ\b|°/g, "");
  s = s.replace(/\{,\}/g, ".").replace(/,/g, ".");
  
  // Russian preamble and helper words normalization
  s = s.replace(/область\s+определения\s+функци[ияй]/gi, "");
  s = s.replace(/множество\s+значений\s+функци[ияй]/gi, "");
  s = s.replace(/функци[ияй]/gi, "");
  s = s.replace(/\bдля\b/gi, "");
  s = s.replace(/\bпри\b/gi, "");
  s = s.replace(/\bгде\b/gi, "");
  
  // 9. Strip remaining latex command backslashes, curly braces, and whitespace
  s = s.replace(/\\[a-zA-Z]+/g, "");
  s = s.replace(/[{}]/g, "");
  s = s.replace(/[:;,.]/g, "");
  s = s.replace(/\s+/g, "");
  return s.toLowerCase();
}

function areAnswersEquivalent(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const ka = canonicalAnswerKey(a);
  const kb = canonicalAnswerKey(b);
  if (!ka || !kb) return false;
  if (ka === kb) return true;
  // If only difference is extra outer/inner parentheses around terms
  const stripParens = (str: string) => str.replace(/[()]/g, "");
  if (stripParens(ka) === stripParens(kb)) return true;
  return false;
}

function matchesOption(answer: string | null | undefined, opt: string, latexOpt: string, index: number): boolean {
  if (!answer) return false;
  const ans = answer.trim();
  if (!ans) return false;
  
  // 1. Direct / canonical equivalence
  if (areAnswersEquivalent(ans, opt) || areAnswersEquivalent(ans, latexOpt)) {
    return true;
  }
  
  const canAns = canonicalAnswerKey(ans);
  
  // 2. Letter matches ("A", "B", "C", "D" or "а", "б", "в", "г")
  const enLetter = String.fromCharCode(65 + index).toLowerCase();
  const ruLetter = ["а", "б", "в", "г", "д", "е"][index] || "";
  if (canAns === enLetter || canAns === ruLetter) {
    return true;
  }

  // 3. Explicit index patterns ("option_0", "choice_1", "opt_2", "#0")
  const explicitIndexMatch = ans.match(/^(?:option|choice|opt|ans|idx|#)[_\s-]*([0-9]+)$/i);
  if (explicitIndexMatch && parseInt(explicitIndexMatch[1], 10) === index) {
    return true;
  }
  
  return false;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CircularScore({ score, status }: { score: number | null; status?: string | null }) {
  const cfg = toneForStatus(status);
  const r = 46, circ = 2 * Math.PI * r;
  const shown = score ?? 0;
  return (
    <div className="relative flex items-center justify-center w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full -rotate-90 drop-shadow-sm">
        <circle cx="56" cy="56" r={r} fill="none" stroke={cfg.track} strokeWidth="10" />
        <circle cx="56" cy="56" r={r} fill="none" stroke="currentColor"
          strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * circ} ${circ}`}
          className={cfg.ring}
          style={{ transition: "stroke-dasharray 1.2s ease" }}
        />
      </svg>
      <div className="relative text-center select-none">
        <div className="text-2xl font-black text-slate-900 tracking-tight">{score === null ? "—" : `${score}%`}</div>
        <div className="text-[9px] text-slate-400 font-bold tracking-widest uppercase mt-0.5">Результат</div>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, count, action }: { icon: any; title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-2 mb-4 min-w-0">
      <div className="flex items-center gap-2.5 min-w-0 flex-1 basis-48">
        <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-primary-600" />
        </div>
        <h2 className="font-bold text-slate-800 text-sm min-w-0 break-words" title={title}>{title}</h2>
        {count !== undefined && (
          <span className="text-xs font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full flex-shrink-0">{count}</span>
        )}
      </div>
      {action && (
        <div className="flex-shrink-0">
          {action}
        </div>
      )}
    </div>
  );
}

/** A visible tab never stays blank: honest placeholder instead of an empty panel. */
function TabNotice({ icon: Icon, title, text, tone = "slate", testId }: {
  icon: any; title: string; text?: string; tone?: "slate" | "emerald"; testId: string;
}) {
  const box = tone === "emerald" ? "border-emerald-200/80 bg-emerald-50/40" : "border-slate-200/80 bg-slate-50/60";
  const chip = tone === "emerald" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500";
  return (
    <div data-testid={testId} className={`min-w-0 rounded-2xl border p-5 sm:p-6 shadow-2xs flex items-start gap-3.5 ${box}`}>
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${chip}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="min-w-0 space-y-1">
        <h2 className="font-bold text-slate-900 text-sm sm:text-base break-words">{title}</h2>
        {text && <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-words">{text}</p>}
      </div>
    </div>
  );
}

const fade = { hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DiagnosticReportPage() {
  const params  = useParams();
  const router  = useRouter();
  const pathname = usePathname();
  const isTeacher = pathname?.startsWith("/teacher");
  const inviteId = params.id as string;

  const [invite, setInvite]           = useState<InviteInfo | null>(null);
  const [report, setReport]           = useState<any>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  // HTTP status of the failed load (403 / 404 have their own screens, no «Повторить»).
  const [reportErrorStatus, setReportErrorStatus] = useState<number | null>(null);
  // The bounded poll gave up: «Отчёт формируется дольше обычного» + «Проверить снова».
  const [pollExhausted, setPollExhausted] = useState(false);
  const acknowledgedInviteRef = useRef<string | null>(null);
  const [retryNonce, setRetryNonce]   = useState(0);
  const [loading, setLoading]         = useState(true);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [currentStudentGroup, setCurrentStudentGroup] = useState<{ id: string; name: string } | null>(null);
  const [assignedNotification, setAssignedNotification] = useState<{
    groupName: string;
    teacherName?: string | null;
    studentName: string;
    classLevel?: number | null;
  } | null>(null);
  const [errorPage, setErrorPage]     = useState(0);
  const [activeTab, setActiveTab]     = useState<ReportTab>("journal");
  const [expandedChains, setExpandedChains]     = useState<number[]>([]);
  const [expandedClusters, setExpandedClusters] = useState<string[]>([]);

  const toggleChain = (idx: number) => {
    setExpandedChains((prev) =>
      prev.includes(idx) ? prev.filter((i) => i !== idx) : [...prev, idx]
    );
  };

  const toggleAllChains = (allIndices: number[]) => {
    if (expandedChains.length === allIndices.length) {
      setExpandedChains([]);
    } else {
      setExpandedChains(allIndices);
    }
  };

  const toggleCluster = (cat: string) => {
    setExpandedClusters((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const toggleAllClusters = (allCats: string[]) => {
    if (expandedClusters.length === allCats.length) {
      setExpandedClusters([]);
    } else {
      setExpandedClusters(allCats);
    }
  };

  const ERRORS_PER_PAGE = 3;

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollAttempt = 0;            // polls made after the initial load
    let waitingForVisible = false;  // a poll is due but the tab is hidden
    let target: { studentId: string; sessionId: string } | null = null;

    const fail = (e: any) => {
      console.error(e);
      if (cancelled) return;
      setReportErrorStatus(typeof e?.status === "number" ? e.status : null);
      setReportError(e?.message || "Не удалось загрузить отчёт. Повторите попытку.");
    };

    // One decision after every response: stop (ready / failed / cap) or poll again.
    // Polls only the student report endpoint, with backoff, never in a hidden tab.
    // `{report: null}` and "ready" without report_json poll as well.
    const afterResponse = (reportData: any) => {
      const step = nextReportPollStep({
        attempt: pollAttempt,
        hasReportJson: Boolean(reportData?.report_json),
        status: reportData?.report_generation?.status,
      });
      if (step.kind === "wait") pollTimer = setTimeout(tick, step.delayMs);
      else if (step.kind === "exhausted") setPollExhausted(true);
    };

    const tick = () => {
      pollTimer = null;
      if (cancelled) return;
      if (typeof document !== "undefined" && document.hidden) { waitingForVisible = true; return; }
      void pollReport();
    };

    const onVisibility = () => {
      if (cancelled || !waitingForVisible || document.hidden) return;
      waitingForVisible = false;
      tick();
    };

    const pollReport = async () => {
      if (!target) return;
      pollAttempt += 1;
      try {
        const rep = await analyticsApi.studentReport(target.studentId, target.sessionId);
        if (cancelled) return;
        const reportData = rep && "report" in rep && rep.report === null ? null : rep;
        setReport(reportData);
        afterResponse(reportData);
      } catch (e: any) {
        fail(e);
      }
    };

    const load = async () => {
      try {
        const found = await orgApi.getDiagnostic(inviteId) as InviteInfo;
        if (!found) { router.push(isTeacher ? "/teacher/groups" : "/admin/diagnostics"); return; }
        if (cancelled) return;
        setInvite(found);
        if (found.student_id && found.session_id) {
          target = { studentId: found.student_id, sessionId: found.session_id };
          const [rep, studentData] = await Promise.all([
            analyticsApi.studentReport(found.student_id, found.session_id),
            found.student_id ? orgApi.getStudentProfile(found.student_id).catch(() => null) : null,
          ]);
          if (cancelled) return;
          const reportData = rep && "report" in rep && rep.report === null ? null : rep;
          setReport(reportData);
          setReportError(null);
          setReportErrorStatus(null);
          if (studentData) {
            found.student_status = studentData.student.status;
            setCurrentStudentGroup(
              studentData.group
                ? { id: studentData.group.id, name: studentData.group.name }
                : null,
            );
          } else {
            setCurrentStudentGroup(null);
          }
          afterResponse(reportData);
        } else if (found.status === "completed") {
          setReport(null);
          setReportError("У завершённой диагностики отсутствует идентификатор попытки. Отчёт не может быть подменён другой диагностикой.");
        }
      } catch (e: any) {
        fail(e);
      }
      finally { if (!cancelled) setLoading(false); }
    };

    setPollExhausted(false);
    document.addEventListener("visibilitychange", onVisibility);
    void load();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [inviteId, isTeacher, retryNonce, router]);

  // Opening a fully generated initial report is the teacher's acknowledgement
  // of the new student. This is intentionally not performed for admins, and
  // the endpoint is idempotent to withstand a refresh or report polling.
  useEffect(() => {
    if (!isTeacher || !invite?.id || !report?.report_json || acknowledgedInviteRef.current === invite.id) return;
    acknowledgedInviteRef.current = invite.id;
    void orgApi.acknowledgeDiagnosticReport(invite.id).catch(() => {
      acknowledgedInviteRef.current = null;
    });
  }, [invite?.id, isTeacher, report?.report_json]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
        <p className="text-xs text-slate-400">Загружаем отчёт...</p>
      </div>
    );
  }
  if (!invite) {
    // Never `null`: a retry shows the spinner again, a missing invite shows its own error.
    if (!reportError) {
      return (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
          <p className="text-xs text-slate-400">Загружаем отчёт...</p>
        </div>
      );
    }
    const info = loadErrorInfo(reportErrorStatus, reportError, "diagnostic");
    return (
      <div className="max-w-xl mx-auto mt-16 bg-white rounded-2xl border border-rose-100 p-6 sm:p-8 text-center shadow-sm" data-testid="diagnostic-report-load-error">
        <AlertTriangle className="w-10 h-10 mx-auto mb-3 text-rose-500" />
        <h1 className="text-lg font-bold text-slate-900 break-words">{info.title}</h1>
        <p className="text-sm text-slate-500 mt-2 break-words">{info.text}</p>
        {info.retryable ? (
          <button
            type="button"
            onClick={() => { setReportError(null); setReportErrorStatus(null); setLoading(true); setRetryNonce((value) => value + 1); }}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700"
          >
            Повторить
          </button>
        ) : (
          <Link
            href={isTeacher ? "/teacher/groups" : "/admin/diagnostics"}
            className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            Назад к списку
          </Link>
        )}
      </div>
    );
  }

  const isPending = !invite.student_id || invite.status !== "completed";
  // Old / partial report_json is normalised once; the rest of the page reads this object only.
  const rj = normalizeReportJson(report?.report_json) as ReportJson | null;
  const reportGeneration = report?.report_generation;
  const generationStageCopy: Record<string, { title: string; description: string }> = {
    queued: { title: "Отчёт поставлен в очередь", description: "Ответы уже сохранены. Подготовка начнётся автоматически." },
    collecting_evidence: { title: "Проверяем результаты", description: "Сверяем ответы, навыки и журнал ошибок." },
    writing_methodical_conclusion: { title: "Формируем автоматическое резюме", description: "Готовим компактный персональный план обучения." },
    retry_queued: { title: "Повторно готовим отчёт", description: "Исходные ответы сохранены; повторяем подготовку отчёта." },
    failed: { title: "Подготовка отчёта требует повторного запуска", description: "Исходные результаты сохранены. Обратитесь к администратору для повторной подготовки." },
  };
  const generationCopy = generationStageCopy[reportGeneration?.stage || ""] || {
    title: "Готовим отчёт",
    description: "Ответы сохранены. Обычно подготовка занимает до минуты.",
  };
  const level = rj ? resolveReportLevel(rj) : null;
  // Error-free attempt: a positive scenario (achievements + a development step).
  const errorFree = rj ? isErrorFreeReport(rj) : false;
  const achievements = reportAchievements(rj) as Achievement[];
  const tabs = rj ? tabContentState(rj) : null;
  const meta = reportMetaInfo(reportGeneration, rj);
  const scorePercent = rj ? reportScorePercent(rj) : null;
  const wrongCount = rj ? reportWrongCount(rj.report_meta) : null;
  const levelText = rj ? ((level?.status && levelStatusLabel(level.status)) || rj.overall.status_label_ru || null) : null;
  const cfg = rj ? toneForStatus(level?.status) : null;
  const solvedText = level ? formatSolved(level.solved, level.total) : null;
  const tabDefs: Array<{
    key: ReportTab; label: string; Icon: any; iconClass: string; badge: number; badgeClass: string;
  }> = [
    { key: "journal", label: "Журнал ошибок", Icon: FileText, iconClass: "text-rose-500", badge: rj?.error_patterns.length ?? 0, badgeClass: "bg-rose-100 text-rose-700" },
    { key: "skills", label: "Анализ навыков и первопричин", Icon: GitBranch, iconClass: "text-indigo-500", badge: rj?.root_cause_chains?.length ?? 0, badgeClass: "bg-indigo-100 text-indigo-700" },
    { key: "plan", label: "План обучения", Icon: ListChecks, iconClass: "text-emerald-500", badge: 0, badgeClass: "" },
  ];
  // Arrow keys / Home / End move between tabs (WAI-ARIA tabs pattern).
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const at = REPORT_TABS.indexOf(activeTab);
    const n = REPORT_TABS.length;
    let next = at;
    if (e.key === "ArrowRight") next = (at + 1) % n;
    else if (e.key === "ArrowLeft") next = (at + n - 1) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else return;
    e.preventDefault();
    setActiveTab(REPORT_TABS[next]);
    document.getElementById(`report-tab-${REPORT_TABS[next]}`)?.focus();
  };

  return (
    <div className="space-y-5 w-full min-w-0 max-w-[1200px] mx-auto">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined" && window.history.length > 1) {
              router.back();
            } else {
              router.push(isTeacher ? "/teacher/groups" : "/admin/diagnostics");
            }
          }}
          className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors flex-shrink-0"
          title="Назад"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        {/* min-w-[12rem]: below it the group button wraps under the title instead of squeezing it */}
        <div className="flex-1 min-w-[12rem]">
          <h1 className="text-xl font-bold text-slate-900 break-words">Отчёт диагностики</h1>
          <p className="text-xs text-slate-400 break-words mt-0.5">
            {invite.student_id ? (
              <Link
                href={isTeacher ? `/teacher/students/${invite.student_id}` : `/admin/students/${invite.student_id}`}
                className="hover:text-primary-600 font-medium text-slate-700 transition-colors"
              >
                {invite.student_name}
              </Link>
            ) : (
              invite.student_name
            )}{" "}
            · {invite.class_level} класс · код{" "}
            <span className="font-mono font-semibold">{invite.code}</span>
          </p>
        </div>

        {/* A teacher reuses this report view, but group membership is an
            organisation-admin operation. The API enforces it too; this keeps
            the teacher UI strictly read-only. */}
        {!isTeacher && invite.status === "completed" && invite.student_id && (
          <button
            onClick={() => setAssignModalOpen(true)}
            className={`flex max-w-full items-center gap-1.5 px-4 py-2 rounded-xl transition-all font-medium text-sm shadow ${
              assignedNotification || invite.student_status === "active"
                ? "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 shadow-emerald-600/10"
                : "bg-gradient-to-r from-primary-600 to-indigo-600 text-white hover:opacity-90 shadow-primary-600/20"
            }`}
          >
            {assignedNotification ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Группа: {assignedNotification.groupName}</span>
              </>
            ) : (
              <>
                <Users className="w-4 h-4" />
                <span>{invite.student_status === "active" ? "Сменить группу" : "В группу"}</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* ── Assignment Notification Banner ────────────────────────────────────────── */}
      <AnimatePresence>
        {assignedNotification && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ type: "spring", duration: 0.4 }}
            className="p-3 sm:p-3.5 bg-gradient-to-r from-emerald-50 via-teal-50/70 to-emerald-50/50 border-2 border-emerald-500/30 rounded-2xl shadow-sm flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center flex-shrink-0 shadow-sm shadow-emerald-500/30">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <span className="text-sm font-bold text-emerald-950">
                Ученик зачислен в группу!
              </span>
            </div>
            <button
              onClick={() => setAssignedNotification(null)}
              className="p-1.5 rounded-lg text-emerald-700 hover:bg-emerald-100/80 transition-colors flex-shrink-0"
              title="Скрыть уведомление"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {!isTeacher && (
        <AssignGroupModal
          open={assignModalOpen}
          studentId={invite.student_id || ""}
          studentName={invite.student_name}
          studentGrade={invite.class_level}
          currentGroupId={currentStudentGroup?.id || null}
          currentGroupName={currentStudentGroup?.name || null}
          onClose={() => setAssignModalOpen(false)}
          onAssigned={(group) => {
            setAssignModalOpen(false);
            setInvite({ ...invite, student_status: "active" });
            if (group) {
              setAssignedNotification({
                groupName: group.name,
                teacherName: group.teacher_name,
                studentName: invite.student_name,
                classLevel: group.class_level,
              });
            }
          }}
        />
      )}

      {/* ── Pending ─────────────────────────────────────────────────────────── */}
      {isPending && (
        <div className="flex flex-col items-center gap-3 py-16 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
          <XCircle className="w-10 h-10 text-slate-200" />
          <p className="text-slate-600 font-semibold text-sm">Диагностика ещё не пройдена</p>
          <p className="text-xs text-slate-400">
            Ученик <span className="font-semibold">{invite.student_name}</span> не завершил тест
            по коду <span className="font-mono font-bold">{invite.code}</span>.
          </p>
        </div>
      )}

      {/* ── Generating / unavailable ──────────────────────────────────────── */}
      {!isPending && !rj && (() => {
        const errInfo = reportError ? loadErrorInfo(reportErrorStatus, reportError, "report") : null;
        const failed = reportGeneration?.status === "failed";
        const calm = Boolean(errInfo) || pollExhausted || failed;
        return (
          <div
            data-testid="diagnostic-report-generating"
            className={`flex flex-col items-center gap-3 px-4 py-12 sm:py-14 rounded-2xl border text-center ${errInfo ? "bg-rose-50 border-rose-100" : "bg-amber-50 border-amber-100"}`}
          >
            <div className={calm ? "" : "animate-pulse"}>
              <AlertTriangle className={`w-9 h-9 ${errInfo ? "text-rose-500" : "text-amber-400"}`} />
            </div>
            <p className={`font-semibold text-sm break-words ${errInfo ? "text-rose-800" : "text-amber-800"}`}>
              {errInfo ? errInfo.title : pollExhausted ? "Отчёт формируется дольше обычного" : generationCopy.title}
            </p>
            <p className={`text-xs max-w-sm break-words ${errInfo ? "text-rose-700" : "text-amber-700"}`}>
              {errInfo ? errInfo.text : pollExhausted ? "Отчёт пока не готов. Проверьте ещё раз через некоторое время." : generationCopy.description}
            </p>
            {errInfo ? (
              errInfo.retryable && (
                <button
                  type="button"
                  onClick={() => { setReportError(null); setReportErrorStatus(null); setRetryNonce((value) => value + 1); }}
                  className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-100"
                >
                  Повторить загрузку
                </button>
              )
            ) : pollExhausted ? (
              <button
                type="button"
                onClick={() => { setPollExhausted(false); setRetryNonce((value) => value + 1); }}
                className="mt-1 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white border border-amber-200 text-amber-800 text-xs font-semibold hover:bg-amber-100"
              >
                Проверить снова
              </button>
            ) : !failed && (
              <p className="text-[11px] text-amber-600">Статус обновляется автоматически — страницу обновлять не нужно.</p>
            )}
          </div>
        );
      })()}

      {/* ══════════════════════════════════════════════════════════════════
          REPORT BLOCKS
      ══════════════════════════════════════════════════════════════════ */}
      {rj && (
        <motion.div
          initial="hidden" animate="show"
          variants={{ show: { transition: { staggerChildren: 0.06 } } }}
          className="space-y-5"
        >

          {/* ── Report meta: attempt date, build date, stale / degraded notes ── */}
          {(meta.attemptDate || meta.generatedOn || meta.legacy || meta.degraded) && (
            <motion.div variants={fade} data-testid="diagnostic-report-meta" className="min-w-0 space-y-2">
              {(meta.attemptDate || meta.generatedOn) && (
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  {meta.attemptDate && (
                    <span data-testid="diagnostic-report-attempt-date">Диагностика пройдена: <span className="font-semibold text-slate-700">{meta.attemptDate}</span></span>
                  )}
                  {meta.generatedOn && (
                    <span data-testid="diagnostic-report-generated-on">Отчёт сформирован: <span className="font-semibold text-slate-700">{meta.generatedOn}</span></span>
                  )}
                </p>
              )}
              {meta.legacy && (
                <div data-testid="diagnostic-report-legacy" className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                  <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-px" />
                  <span className="min-w-0 break-words"><span className="font-semibold">Отчёт сформирован в старом формате.</span> Некоторые разделы могут быть показаны не полностью.</span>
                </div>
              )}
              {meta.degraded && (
                <div data-testid="diagnostic-report-degraded" className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-700">
                  <Info className="w-4 h-4 text-slate-400 flex-shrink-0 mt-px" />
                  <span className="min-w-0 break-words">При подготовке отчёта часть справочных данных была недоступна: некоторые названия тем могут отображаться неполностью.</span>
                </div>
              )}
            </motion.div>
          )}

          {/* ── BLOCK 1: Hero Score Card ─────────────────── */}
          <motion.div
            variants={fade}
            data-testid="diagnostic-report-score-card"
            className={`rounded-2xl border p-4 sm:p-6 shadow-sm relative overflow-hidden ${cfg!.cardBg} ${cfg!.cardBorder}`}
          >
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
              {/* Circular Score */}
              <CircularScore score={scorePercent} status={level?.status ?? rj.overall.status} />

              {/* Status Pill Badge */}
              <div className="w-full min-w-0 flex flex-col items-center justify-center sm:w-auto sm:flex-1 sm:items-start">
                {levelText && (
                  <div data-testid="diagnostic-report-level" className={`inline-flex max-w-full min-w-0 items-center gap-2.5 px-4 py-2 rounded-full text-sm font-bold border shadow-sm ${cfg!.badge}`}>
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${cfg!.ping}`} />
                      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${cfg!.dot}`} />
                    </span>
                    <span className="min-w-0 break-words text-center sm:text-left">
                      {levelText}
                    </span>
                  </div>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-slate-600 sm:justify-start">
                  {level?.provisional && (
                    <span data-testid="diagnostic-report-provisional" className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">
                      {PROVISIONAL_LABEL}
                    </span>
                  )}
                  {solvedText && <span data-testid="diagnostic-report-solved">{solvedText}</span>}
                </div>
              </div>

              {/* Right Stat Cards */}
              <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
                <div className="flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur border border-emerald-100 rounded-2xl shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100/80 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-lg font-black text-slate-900 leading-none">{rj.report_meta.questions_correct ?? "—"}</div>
                    <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">Верных</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur border border-rose-100 rounded-2xl shadow-sm">
                  <div className="w-9 h-9 rounded-xl bg-rose-100/80 flex items-center justify-center text-rose-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-lg font-black text-slate-900 leading-none">{wrongCount ?? "—"}</div>
                    <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-1">Ошибок</div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── BLOCK 2: AI Student Summary ─────────────────────────────────── */}
          {rj.overall.student_summary && (
            <motion.div variants={fade} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
              <div className="flex gap-3">
                <div className="w-1 rounded-full bg-primary-400 flex-shrink-0 self-stretch" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Краткое резюме (сформировано автоматически)</p>
                  <p className="text-sm text-slate-700 leading-relaxed break-words">{rj.overall.student_summary}</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── SECTION TABS SWITCHER ── */}
          <motion.div
            variants={fade}
            role="tablist"
            aria-label="Разделы отчёта"
            onKeyDown={onTabKeyDown}
            className="grid grid-cols-1 lg:grid-cols-3 items-stretch gap-1.5 p-1.5 bg-slate-100/90 rounded-2xl border border-slate-200/70 shadow-2xs"
          >
            {tabDefs.map(({ key, label, Icon, iconClass, badge, badgeClass }) => (
              <button
                key={key}
                type="button"
                role="tab"
                id={`report-tab-${key}`}
                aria-selected={activeTab === key}
                aria-controls="report-tabpanel"
                tabIndex={activeTab === key ? 0 : -1}
                onClick={() => setActiveTab(key)}
                className={`min-w-0 flex-1 flex items-center justify-center gap-2 py-3 px-3 sm:px-4 rounded-xl text-xs font-bold transition-all ${
                  activeTab === key
                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/60"
                }`}
              >
                <Icon className={`w-4 h-4 flex-shrink-0 ${iconClass}`} />
                <span className="min-w-0 break-words text-center">{label}</span>
                {badge > 0 && (
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-[10px] font-extrabold flex-shrink-0 ${badgeClass}`}>
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </motion.div>

          <div role="tabpanel" id="report-tabpanel" aria-labelledby={`report-tab-${activeTab}`} className="min-w-0 space-y-6">
          {/* ── TAB 1: Error Journal — paginated ──────────────────────────── */}
          {activeTab === "journal" && rj.error_patterns.length > 0 && (() => {
            const totalPages = Math.ceil(rj.error_patterns.length / ERRORS_PER_PAGE);
            const pageErrors = rj.error_patterns.slice(
              errorPage * ERRORS_PER_PAGE,
              (errorPage + 1) * ERRORS_PER_PAGE
            );
            return (
              <motion.div variants={fade} className="bg-white rounded-[28px] border border-slate-200/80 shadow-[0_18px_50px_-28px_rgba(15,23,42,0.32)] overflow-hidden">

                {/* ── Journal Header ── */}
                <div className="flex items-center gap-3 px-4 sm:px-6 lg:px-8 py-4 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50/70">
                  <div className="flex items-center gap-2.5 flex-1 min-w-0">
                    <div className="w-10 h-10 rounded-2xl bg-rose-50 ring-1 ring-rose-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-4 h-4 text-rose-500" />
                    </div>
                    <div>
                      <h2 className="font-bold text-slate-900 text-sm leading-none">Журнал ошибок</h2>
                    </div>
                  </div>
                  {/* Compact pagination in header */}
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setErrorPage(p => Math.max(0, p - 1))} disabled={errorPage === 0}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      {Array.from({ length: totalPages }).map((_, pi) => (
                        <button key={pi} onClick={() => setErrorPage(pi)}
                          className={`w-7 h-7 rounded-lg text-xs font-bold transition-all ${
                            pi === errorPage ? "bg-slate-900 text-white" : "text-slate-400 hover:bg-slate-100"
                          }`}>{pi + 1}</button>
                      ))}
                      <button onClick={() => setErrorPage(p => Math.min(totalPages - 1, p + 1))} disabled={errorPage === totalPages - 1}
                        className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Error Entries ── */}
                <div className="divide-y divide-slate-100/80">
                  {pageErrors.map((err, i) => {
                    const globalIdx = errorPage * ERRORS_PER_PAGE + i + 1;
                    const isDistractor = err.eval_category === "distractor";
                    const hasMcqOptions = err.answer_options && err.answer_options.length > 0;

                    return (
                      <div key={i} className="min-w-0 px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-5 sm:space-y-6 hover:bg-slate-50/30 transition-colors">

                        {/* ── Entry Top Bar: number pill + skill name ── */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[11px] font-black tracking-wider bg-slate-900 text-white shadow-2xs">
                            № {globalIdx}
                          </span>
                          {err.skill_name_ru && (
                            <span className="min-w-0 text-xs font-semibold text-slate-500 break-words">
                              {err.skill_name_ru}
                            </span>
                          )}
                        </div>

                        {/* ── Task Question Container ── */}
                        <div className="min-w-0 rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 md:p-6 shadow-2xs">
                          <div className="mb-2 flex items-center gap-1.5 text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 inline-block" />
                            Условие задачи
                          </div>
                          <TaskStatement
                            task={{
                              question_text: err.question_text || "",
                              question_latex: err.question_latex || null,
                            }}
                            fallbackText="Условие задания недоступно"
                            className="text-[15px] sm:text-[16px] text-slate-800 leading-relaxed font-normal whitespace-pre-wrap break-words"
                          />
                        </div>

                          {/* MCQ Options (if applicable) */}
                          {hasMcqOptions && (() => {
                            const optionsList = err.answer_options || [];
                            const optionsLatex = err.answer_options_latex || [];

                            // Deduplicate options list by canonical key to guarantee no duplicate options (e.g. A and E) are rendered
                            const seenKeys = new Set<string>();
                            const uniqueOptions: { opt: string; latex: string; originalIndex: number }[] = [];
                            optionsList.forEach((opt, oi) => {
                              const key = canonicalAnswerKey(opt) || (opt || "").trim().toLowerCase();
                              if (key && !seenKeys.has(key)) {
                                seenKeys.add(key);
                                uniqueOptions.push({ opt, latex: optionsLatex[oi] || opt, originalIndex: oi });
                              }
                            });

                            const hasLongOptions = uniqueOptions.some((item) => {
                              const display = item.latex || item.opt || "";
                              return display.length > 80 || /\\text\{|\n/.test(display);
                            });
                            const hasMatchedStudentOpt = uniqueOptions.some((item, oi) => matchesOption(err.student_answer, item.opt, item.latex, oi));

                            return (
                              <div className="space-y-3">
                                <div className={`grid gap-3 sm:gap-4 ${hasLongOptions ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-2"}`}>
                                  {uniqueOptions.map((item, oi) => {
                                    const isCorrect = matchesOption(err.correct_answer, item.opt, item.latex, oi);
                                    const isStudentAnswer = matchesOption(err.student_answer, item.opt, item.latex, oi);
                                    return (
                                      <div key={oi} className={`flex min-w-0 items-start gap-4 overflow-hidden p-4 rounded-xl border transition-all ${
                                        isCorrect
                                          ? "bg-emerald-50/70 border-emerald-200/90 shadow-2xs"
                                          : isStudentAnswer && !isCorrect
                                            ? "bg-white border-rose-200/90 shadow-2xs"
                                            : "bg-white border-slate-200/70 hover:border-slate-300"
                                      }`}>
                                        <span className={`w-7 h-7 min-w-[28px] min-h-[28px] rounded-lg text-xs font-black flex items-center justify-center flex-shrink-0 ${
                                          isCorrect ? "bg-emerald-600 text-white shadow-2xs" :
                                          isStudentAnswer ? "bg-rose-500 text-white shadow-2xs" :
                                          "bg-slate-100 text-slate-500"
                                        }`}>{String.fromCharCode(65 + oi)}</span>
                                        <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden py-0.5 no-scrollbar">
                                          <MathRenderer
                                            text={pickAnswerDisplayText(item.opt, item.latex)}
                                            block
                                            className="min-w-0 max-w-full text-[14px] sm:text-[14.5px] leading-snug break-words font-normal text-slate-800"
                                          />
                                        </div>
                                        {isCorrect && <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />}
                                        {isStudentAnswer && !isCorrect && <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
                                      </div>
                                    );
                                  })}
                                </div>
                                {!hasMatchedStudentOpt && err.student_answer && !["idk", "__wrong__", "test"].includes(err.student_answer.trim().toLowerCase()) && (
                                  <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 rounded-xl bg-rose-50/70 border border-rose-200/80 text-xs font-medium text-rose-950">
                                    <XCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />
                                    <span className="font-semibold text-rose-700">Введённый ответ ученика:</span>
                                    <div className="min-w-0 max-w-full flex-1 basis-40 overflow-x-auto">
                                      <MathRenderer block text={pickAnswerDisplayText(err.student_answer || "", err.student_answer_latex)} className="min-w-0 max-w-full break-words font-normal text-[14px] text-slate-800" />
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                          {/* Text answer comparison (non-MCQ) */}
                          {!hasMcqOptions && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Student answer */}
                              <div className="min-w-0 rounded-xl border bg-white border-rose-200/90 p-4 sm:p-5 shadow-2xs">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                                  <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">Ответ ученика</span>
                                </div>
                                {err.student_answer
                                  ? <MathRenderer text={pickAnswerDisplayText(err.student_answer, err.student_answer_latex)} block className="text-[14px] sm:text-[14.5px] font-normal text-slate-800 leading-relaxed break-words" />
                                  : <span className="text-xs font-normal text-slate-400">—</span>
                                }
                              </div>
                              {/* Correct answer */}
                              <div className="min-w-0 rounded-xl border bg-emerald-50/70 border-emerald-200/90 p-4 sm:p-5 shadow-2xs">
                                <div className="flex items-center gap-1.5 mb-2">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                                  <span className="text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">Верный ответ</span>
                                </div>
                                {(err.correct_answer_latex || err.correct_answer)
                                  ? <MathRenderer text={pickAnswerDisplayText(err.correct_answer || "", err.correct_answer_latex)} block className="text-[14px] sm:text-[14.5px] font-normal text-slate-800 leading-relaxed break-words" />
                                  : <span className="text-xs font-normal text-slate-400">—</span>
                                }
                              </div>
                            </div>
                          )}

                          {/* Distractor explanation (real from DB) */}
                          {isDistractor && err.distractor_explanation && (
                            <div className="min-w-0 rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 md:p-6 shadow-2xs">
                              <div className="mb-2 flex items-center gap-1.5 text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                                <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 inline-block" />
                                Анализ ошибки
                              </div>
                              <div className="min-w-0 text-[14.5px] sm:text-[15px] text-slate-800 leading-relaxed font-normal">
                                    <MathRenderer block text={pickAnswerDisplayText(err.distractor_explanation || "", err.distractor_explanation_latex)} className="min-w-0 max-w-full break-words text-[14.5px] sm:text-[15px] text-slate-800 leading-relaxed font-normal" />
                              </div>
                            </div>
                          )}

                          {/* Generic distractor notice (no explanation available) */}
                          {isDistractor && !err.distractor_explanation && (
                            <div className="min-w-0 rounded-2xl bg-slate-50/70 border border-slate-200/80 p-4 sm:p-5 md:p-6 shadow-2xs">
                              <div className="mb-2 flex items-center gap-1.5 text-[9px] sm:text-[9.5px] font-bold uppercase tracking-[0.08em] text-slate-400">
                                <span className="w-1 h-1 rounded-full bg-slate-400 shrink-0 inline-block" />
                                Анализ ошибки
                              </div>
                              <p className="text-[14.5px] sm:text-[15px] font-normal text-slate-800 leading-relaxed">Ученик выбрал характерный ложный вариант ответа (дистрактор).</p>
                            </div>
                          )}

                      </div>
                    );
                  })}
                </div>

                {/* ── Journal Footer ── */}
                {totalPages > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 border-t border-slate-100 bg-slate-50/50">
                    <span className="text-xs text-slate-400">
                      Записи <span className="font-semibold text-slate-700">{errorPage * ERRORS_PER_PAGE + 1}–{Math.min((errorPage + 1) * ERRORS_PER_PAGE, rj.error_patterns.length)}</span> из <span className="font-semibold text-slate-700">{rj.error_patterns.length}</span>
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setErrorPage(p => Math.max(0, p - 1))} disabled={errorPage === 0}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        ← Назад
                      </button>
                      <button onClick={() => setErrorPage(p => Math.min(totalPages - 1, p + 1))} disabled={errorPage === totalPages - 1}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                        Вперёд →
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            );
          })()}

          {/* ── TAB 1 (no errors): positive scenario instead of an empty tab ── */}
          {activeTab === "journal" && rj.error_patterns.length === 0 && (
            <motion.div
              variants={fade}
              data-testid={errorFree ? "diagnostic-report-error-free" : "diagnostic-report-no-errors"}
              className="bg-white rounded-2xl border border-emerald-200/80 p-4 sm:p-6 shadow-2xs space-y-5"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Award className="w-5 h-5 text-emerald-600" />
                </div>
                <div className="min-w-0 space-y-1">
                  <h2 className="font-bold text-slate-900 text-base break-words">
                    {errorFree ? "Все выполненные задания решены верно" : "В журнале нет записей об ошибках"}
                  </h2>
                  {errorFree && (
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Дефицит по результатам диагностики не выявлен
                      {(() => {
                        const below = [
                          achievements.length > 0 ? "подтверждённые навыки" : null,
                          rj.action_plan.length > 0 ? "следующий шаг развития" : null,
                        ].filter(Boolean);
                        return below.length > 0 ? `: ниже — ${below.join(" и ")}.` : ".";
                      })()}
                    </p>
                  )}
                </div>
              </div>

              {achievements.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Подтверждённые навыки</div>
                  <div className="flex flex-wrap gap-2" data-testid="diagnostic-report-achievements">
                    {achievements.map((item) => (
                      <span key={item.skill_id} className="max-w-full break-words text-xs font-medium bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 px-2.5 py-1 rounded-lg">
                        {item.skill_name_ru}
                        {typeof item.correct_answers === "number" && (
                          <span className="ml-1.5 font-normal text-emerald-700/80">· верно: {item.correct_answers}</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {errorFree && rj.action_plan.length > 0 && (
                <div className="rounded-xl border border-primary-100 bg-primary-50/40 p-4 space-y-1" data-testid="diagnostic-report-next-step">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary-700">Следующий шаг развития</div>
                  <div className="text-sm font-semibold text-slate-900">{rj.action_plan[0].action_title || rj.action_plan[0].skill_name_ru}</div>
                  <p className="text-sm text-slate-700 leading-relaxed">{rj.action_plan[0].full_description}</p>
                </div>
              )}
            </motion.div>
          )}

          {/* ── TAB 2: Skills & Root-Cause Anatomy ─────────────────────────── */}
          {activeTab === "skills" && (
            <motion.div variants={fade} className="min-w-0 space-y-6">

              {tabs?.skills === "empty" && (
                <TabNotice testId="diagnostic-report-skills-empty" icon={GitBranch} title={SKILLS_EMPTY_TEXT} />
              )}

              {/* ── Block 1: Academic Boundary & Diagnostic Profile ── */}
              {rj.diagnostic_boundary && !errorFree && hasBoundaryData(rj.diagnostic_boundary) && (
                <div className="min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-2xs space-y-5">
                  <div className="min-w-0 w-full pb-3 border-b border-slate-100">
                    <SectionHeader icon={Target} title="Академическая граница знаний (Диагностический срез)" />
                  </div>

                  {/* 3 columns only from xl: the content area is far narrower than the viewport (sidebar + padding) */}
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                    {/* Anchor Foundation */}
                    <div className="min-w-0 rounded-xl border border-slate-200 hover:border-emerald-300 transition-colors bg-white p-4 sm:p-6 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2.5">
                          <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <Anchor className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                            Опорный фундамент
                          </span>
                          <span className="max-w-full break-words text-xs font-bold px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200/80">
                            {rj.diagnostic_boundary.anchor_level}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Базовые темы, решённые стабильно. Служат точкой отсчёта для старта индивидуальной программы.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                        {rj.diagnostic_boundary.anchor_skills.length > 0 ? (
                          rj.diagnostic_boundary.anchor_skills.map((s, idx) => (
                            <span key={idx} className="text-xs font-medium bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 px-2.5 py-1 rounded-lg max-w-full break-words">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">Базовые навыки не подтверждены</span>
                        )}
                      </div>
                    </div>

                    {/* Breakpoint */}
                    <div className="min-w-0 rounded-xl border border-slate-200 hover:border-rose-300 transition-colors bg-white p-4 sm:p-6 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2.5">
                          <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
                            Точка слома понимания
                          </span>
                          <span className="max-w-full break-words text-xs font-bold px-2.5 py-0.5 rounded-md bg-rose-50 text-rose-800 border border-rose-200/80">
                            {rj.diagnostic_boundary.breakpoint_level}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Корневой пререквизит младших классов, где произошло первичное разрушение алгоритмической логики.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                        {rj.diagnostic_boundary.breakpoint_skills.length > 0 ? (
                          rj.diagnostic_boundary.breakpoint_skills.map((s, idx) => (
                            <span key={idx} className="text-xs font-medium bg-rose-50/80 border border-rose-200/70 text-rose-900 px-2.5 py-1 rounded-lg max-w-full break-words">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">Глубоких сбоев не выявлено</span>
                        )}
                      </div>
                    </div>

                    {/* Blocked Level */}
                    <div className="min-w-0 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors bg-white p-4 sm:p-6 flex flex-col justify-between space-y-4">
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 mb-2.5">
                          <span className="min-w-0 break-words text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                            <Lock className="w-4 h-4 text-slate-500 flex-shrink-0" />
                            Заблокировано
                          </span>
                          <span className="max-w-full break-words text-xs font-bold px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-800 border border-slate-200">
                            {rj.diagnostic_boundary.blocked_level}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          Темы текущего класса, которые невозможно освоить без предварительного закрытия точек слома.
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-3 border-t border-slate-100">
                        {rj.diagnostic_boundary.blocked_skills.length > 0 ? (
                          rj.diagnostic_boundary.blocked_skills.map((s, idx) => (
                            <span key={idx} className="text-xs font-medium bg-slate-100 border border-slate-200 text-slate-700 px-2.5 py-1 rounded-lg max-w-full break-words">
                              {s}
                            </span>
                          ))
                        ) : (
                          <span className="text-xs text-slate-400 italic">Нет заблокированных тем</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Block 2: Root-Cause Descent Chains (Deep Scan) ── */}
              {rj.root_cause_chains && rj.root_cause_chains.length > 0 && (
                <div className="min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-2xs space-y-4">
                  <SectionHeader
                    icon={GitBranch}
                    title="Цепочки диагностического спуска (Deep Scan) — Поиск первопричин"
                    count={rj.root_cause_chains.length}
                    action={
                      <button
                        type="button"
                        onClick={() => toggleAllChains((rj.root_cause_chains || []).map((_: any, i: number) => i))}
                        className="text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline cursor-pointer transition-colors"
                      >
                        {expandedChains.length === (rj.root_cause_chains || []).length ? "Свернуть все" : "Развернуть все"}
                      </button>
                    }
                  />
                  <div className="space-y-3">
                    {rj.root_cause_chains.map((ch, idx) => {
                      const isExpanded = expandedChains.includes(idx);

                      return (
                        <div key={idx} id={`chain-card-${idx}`} className="min-w-0 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs transition-colors hover:border-slate-300">
                          {/* Clean Minimal Header: names wrap (never cut); stacked below lg, a row from lg */}
                          <div
                            onClick={() => toggleChain(idx)}
                            className="px-4 sm:px-5 py-4 cursor-pointer hover:bg-slate-50/70 transition-colors flex flex-wrap items-center justify-between gap-x-4 gap-y-2 select-none"
                          >
                            <div className="flex flex-col gap-1 lg:flex-row lg:items-center lg:gap-2.5 text-sm font-semibold text-slate-900 flex-1 basis-60 min-w-0">
                              <span className="min-w-0 break-words">
                                {ch.source_skill_name}{" "}
                                <span className="text-xs font-medium text-slate-400 whitespace-nowrap">({ch.source_grade} кл)</span>
                              </span>
                              <ArrowRight className="w-4 h-4 text-slate-400 flex-shrink-0 rotate-90 lg:rotate-0" />
                              <span className="min-w-0 break-words font-medium text-rose-600">
                                {ch.root_gap_skill_name}{" "}
                                <span className="text-xs font-normal text-rose-500/80 whitespace-nowrap">({ch.root_gap_grade} кл)</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-3 flex-shrink-0">
                              <span className="text-xs font-medium text-slate-500 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                                {ch.steps_count} {ch.steps_count === 1 ? "шаг" : ch.steps_count < 5 ? "шага" : "шагов"}
                              </span>
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          </div>

                          {/* Expanded Step-by-Step Trajectory with smooth accordion animation */}
                          <AnimatePresence initial={false}>
                            {isExpanded && (
                              <motion.div
                                key={`chain-content-${idx}`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden border-t border-slate-100"
                              >
                                <div className="p-3 sm:p-5 lg:p-6 bg-slate-50/50 space-y-3.5">
                                  {ch.steps.map((st, sIdx) => {
                                    const isCorrect = st.outcome >= 1.0;
                                    return (
                                      <div key={sIdx} className="min-w-0 bg-white rounded-xl border border-slate-200/90 p-3 sm:p-5 shadow-2xs space-y-3">
                                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1.5">
                                          <div className="flex min-w-0 flex-1 basis-40 flex-wrap items-center gap-x-2.5 gap-y-1">
                                            <div className="w-5 h-5 rounded-full bg-slate-900 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                              {sIdx + 1}
                                            </div>
                                            <span className="min-w-0 break-words text-xs sm:text-sm font-semibold text-slate-900">{st.skill_name_ru}</span>
                                            <span className="text-[11px] font-medium text-slate-500 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded whitespace-nowrap">
                                              {st.grade} класс {st.is_deep_scan && "· Deep Scan"}
                                            </span>
                                          </div>
                                          <span className={`flex-shrink-0 text-xs font-bold px-2.5 py-0.5 rounded-md border ${isCorrect ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-rose-50 text-rose-800 border-rose-200"}`}>
                                            {isCorrect ? "Верно" : "Ошибка"}
                                          </span>
                                        </div>

                                        {(st.question_latex || st.question_text) && (
                                          <div className="min-w-0 p-3.5 rounded-lg bg-slate-50 border border-slate-100 text-slate-800 text-sm leading-relaxed">
                                            <TaskStatement task={{ question_text: st.question_text || "", question_latex: st.question_latex }} />
                                          </div>
                                        )}

                                        {(() => {
                                          const ansText = st.student_answer_latex || st.student_answer || "";
                                          const isLong = ansText.length > 45 || ansText.includes("\n");
                                          const answerTone = isCorrect ? "text-emerald-700" : "text-rose-700";
                                          // Answers render as blocks inside min-w-0 / overflow-x-auto: a wide formula
                                          // scrolls inside its box instead of being cut by the card (overflow-hidden).
                                          if (isLong) {
                                            return (
                                              <div className="min-w-0 space-y-2 pt-1">
                                                <div className="min-w-0 p-3 rounded-lg bg-slate-50 border border-slate-200/80 space-y-1">
                                                  <span className="text-xs font-semibold text-slate-500 block">Ответ ученика:</span>
                                                  <div className={`min-w-0 max-w-full overflow-x-auto text-sm sm:text-base font-normal leading-relaxed ${answerTone}`}>
                                                    <MathRenderer block text={ansText || "—"} className="min-w-0 max-w-full" />
                                                  </div>
                                                </div>
                                                {!isCorrect && st.correct_answer && (
                                                  <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 bg-slate-50 border border-slate-200/80 px-3.5 py-2 rounded-xl">
                                                    <span className="text-slate-500 font-semibold text-xs">Правильный ответ:</span>
                                                    <div className="min-w-0 max-w-full flex-1 basis-32 overflow-x-auto font-normal text-sm sm:text-base text-emerald-700">
                                                      <MathRenderer block text={st.correct_answer_latex || st.correct_answer} className="min-w-0 max-w-full" />
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          }
                                          return (
                                            <div className="flex min-w-0 flex-wrap items-center gap-3 pt-1">
                                              <div className="flex min-w-0 max-w-full items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                                                <span className="flex-shrink-0 text-slate-500 font-semibold text-xs">Ответ ученика:</span>
                                                <div className={`min-w-0 max-w-full overflow-x-auto font-normal text-sm sm:text-base ${answerTone}`}>
                                                  <MathRenderer block text={ansText || "—"} className="min-w-0 max-w-full" />
                                                </div>
                                              </div>
                                              {!isCorrect && st.correct_answer && (
                                                <div className="flex min-w-0 max-w-full items-center gap-2 bg-slate-50 border border-slate-200/80 px-3 py-1.5 rounded-xl">
                                                  <span className="flex-shrink-0 text-slate-500 font-semibold text-xs">Правильный ответ:</span>
                                                  <div className="min-w-0 max-w-full overflow-x-auto font-normal text-sm sm:text-base text-emerald-700">
                                                    <MathRenderer block text={st.correct_answer_latex || st.correct_answer} className="min-w-0 max-w-full" />
                                                  </div>
                                                </div>
                                              )}
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Error-free attempt: verified skills instead of a "break point" ── */}
              {errorFree && achievements.length > 0 && (
                <div className="min-w-0 bg-white rounded-2xl border border-emerald-200/80 p-4 sm:p-6 shadow-2xs space-y-3" data-testid="diagnostic-report-skills-error-free">
                  <SectionHeader icon={Anchor} title="Подтверждённые навыки" count={achievements.length} />
                  <div className="flex flex-wrap gap-2">
                    {achievements.map((item) => (
                      <span key={item.skill_id} className="max-w-full text-xs font-medium bg-emerald-50/80 border border-emerald-200/70 text-emerald-900 px-2.5 py-1 rounded-lg break-words">
                        {item.skill_name_ru}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Block 3: Cognitive Error Patterns ── */}
              {rj.cognitive_error_types && rj.cognitive_error_types.length > 0 && (
                <div className="min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-6 shadow-2xs space-y-4">
                  <SectionHeader
                    icon={Brain}
                    title="Когнитивные паттерны ошибок (Анализ мышления)"
                    count={rj.cognitive_error_types.length}
                    action={
                      <button
                        type="button"
                        onClick={() => toggleAllClusters((rj.cognitive_error_types || []).map((cg: any) => cg.category))}
                        className="text-xs font-semibold text-primary-700 hover:text-primary-800 hover:underline cursor-pointer transition-colors"
                      >
                        {expandedClusters.length === (rj.cognitive_error_types || []).length ? "Свернуть все" : "Развернуть все"}
                      </button>
                    }
                  />
                  <div className="space-y-3.5">
                    {rj.cognitive_error_types.map((cg) => {
                      const isExpanded = expandedClusters.includes(cg.category);
                      const hasExamples = cg.examples && cg.examples.length > 0;

                      return (
                        <div key={cg.category} id={`cluster-card-${cg.category}`} className="min-w-0 border border-slate-200 rounded-xl p-4 sm:p-6 bg-white shadow-2xs space-y-4 hover:border-slate-300 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                                <span className="min-w-0 break-words text-sm font-bold text-slate-900">{cg.title}</span>
                                <span className="text-xs font-bold bg-rose-50 text-rose-800 px-2.5 py-0.5 rounded-full border border-rose-200/80 flex-shrink-0">
                                  {cg.count} {cg.count === 1 ? "ошибка" : cg.count < 5 ? "ошибки" : "ошибок"}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed break-words">{cg.description}</p>
                            </div>

                            {hasExamples && (
                              <button
                                onClick={() => toggleCluster(cg.category)}
                                className="text-xs font-semibold text-primary-700 hover:text-primary-800 flex items-center gap-1.5 cursor-pointer transition-colors flex-shrink-0 self-start sm:self-center"
                              >
                                <span>{isExpanded ? "Скрыть примеры" : "Показать примеры заданий"}</span>
                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </button>
                            )}
                          </div>

                          {/* Examples in horizontal columns with smooth accordion animation */}
                          <AnimatePresence initial={false}>
                            {isExpanded && hasExamples && (
                              <motion.div
                                key={`cluster-content-${cg.category}`}
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                                className="overflow-hidden border-t border-slate-100 pt-4"
                              >
                                <div className={`grid grid-cols-1 ${cg.examples.length === 2 ? "lg:grid-cols-2" : cg.examples.length >= 3 ? "lg:grid-cols-2 xl:grid-cols-3" : ""} gap-4`}>
                                  {cg.examples.map((ex, exIdx) => {
                                    const ansText = ex.student_answer_latex || ex.student_answer || "";
                                    const isLong = ansText.length > 35 || ansText.includes("\n");

                                    return (
                                      <div key={exIdx} className="min-w-0 p-3 sm:p-5 rounded-xl bg-slate-50/70 border border-slate-200/90 text-xs flex flex-col h-full space-y-3.5">
                                        <div className="min-w-0 space-y-3">
                                          <div className="font-bold text-slate-800 text-xs break-words">{ex.skill_name_ru}</div>

                                          {(ex.question_latex || ex.question_text) && (
                                            <div className="min-w-0 p-3 rounded-lg bg-white border border-slate-200/80 text-slate-900 text-xs leading-relaxed">
                                              <TaskStatement task={{ question_text: ex.question_text || "", question_latex: ex.question_latex }} />
                                            </div>
                                          )}

                                          {isLong ? (
                                            <div className="min-w-0 space-y-2">
                                              <div className="min-w-0 p-3 rounded-xl bg-white border border-slate-200/80 space-y-1 shadow-2xs">
                                                <span className="text-xs font-semibold text-slate-500 block">Ответ ученика:</span>
                                                <div className="min-w-0 max-w-full overflow-x-auto text-sm sm:text-base font-normal text-rose-700 leading-relaxed">
                                                  <MathRenderer block text={ansText || "—"} className="min-w-0 max-w-full" />
                                                </div>
                                              </div>
                                              {ex.correct_answer && (
                                                <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                                  <span className="text-slate-500 font-semibold text-xs">Правильный ответ:</span>
                                                  <div className="min-w-0 max-w-full flex-1 basis-32 overflow-x-auto font-normal text-sm sm:text-base text-emerald-700"><MathRenderer block text={ex.correct_answer_latex || ex.correct_answer} className="min-w-0 max-w-full" /></div>
                                                </div>
                                              )}
                                            </div>
                                          ) : (
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                              <div className="flex min-w-0 max-w-full items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                                <span className="flex-shrink-0 text-slate-500 font-semibold text-xs">Ответ ученика:</span>
                                                <div className="min-w-0 max-w-full overflow-x-auto font-normal text-sm sm:text-base text-rose-700"><MathRenderer block text={ansText || "—"} className="min-w-0 max-w-full" /></div>
                                              </div>
                                              {ex.correct_answer && (
                                                <div className="flex min-w-0 max-w-full items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200/80 shadow-2xs">
                                                  <span className="flex-shrink-0 text-slate-500 font-semibold text-xs">Правильный ответ:</span>
                                                  <div className="min-w-0 max-w-full overflow-x-auto font-normal text-sm sm:text-base text-emerald-700"><MathRenderer block text={ex.correct_answer_latex || ex.correct_answer} className="min-w-0 max-w-full" /></div>
                                                </div>
                                              )}
                                            </div>
                                          )}
                                        </div>

                                        {(ex.distractor_explanation_latex || ex.distractor_explanation) && (
                                          <div className="min-w-0 mt-auto pt-3 border-t border-slate-200/70 text-slate-700 text-xs sm:text-sm leading-relaxed">
                                            <span className="font-semibold text-slate-900 block mb-1 text-xs">Причина ошибки:</span>
                                            <MathRenderer block text={ex.distractor_explanation_latex || ex.distractor_explanation || ""} className="min-w-0 max-w-full break-words" />
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </motion.div>
          )}

          {/* ── TAB 3: Student Action Plan (Learning Roadmap Timeline) ── */}
          {activeTab === "plan" && (tabs?.plan === "error_free_no_plan" || tabs?.plan === "error_free_with_step") && (
            <motion.div variants={fade}>
              <TabNotice
                testId="diagnostic-report-plan-not-needed"
                tone="emerald"
                icon={Award}
                title={PLAN_NOT_NEEDED_TEXT}
                text={tabs.plan === "error_free_with_step" ? "Ниже — следующий шаг развития." : undefined}
              />
            </motion.div>
          )}
          {activeTab === "plan" && tabs?.plan === "not_built" && (
            <motion.div variants={fade}>
              <TabNotice testId="diagnostic-report-plan-empty" icon={ListChecks} title={PLAN_NOT_BUILT_TEXT} />
            </motion.div>
          )}
          {activeTab === "plan" && rj.action_plan.length > 0 && (() => {
            // Durations are shown only when the report really carries them (it normally does not).
            const totalHours = knownPlanHours(rj.action_plan);
            // One recommended start == the first plan step; no placeholder when it is missing.
            const primaryStart = recommendedStartName(rj) || "—";
            const development = isDevelopmentStep(rj.action_plan[0]);
            const planSkillNames = rj.action_plan
              .map((it) => it.skill_name_ru)
              .filter((name): name is string => Boolean(name));

            return (
              <motion.div variants={fade} className="space-y-6">
                {/* ── Roadmap Header & Strategy Widget ── */}
                <div className="min-w-0 bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-7 shadow-2xs space-y-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                        <Compass className="w-4 h-4 text-primary-600" />
                      </div>
                      <h2 className="font-bold text-slate-900 text-base">
                        {development ? "Следующий шаг развития" : "Индивидуальный образовательный маршрут"}
                      </h2>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-500 pl-9 break-words">
                      {development
                        ? "Дефицит по результатам диагностики не выявлен: предлагается расширить подтверждённые навыки."
                        : "Пошаговый план отработки навыков, выявленных диагностикой, в порядке приоритета."}
                    </p>
                  </div>

                  {/* Summary Metric Widgets */}
                  <div className={`grid grid-cols-1 gap-3 pt-2 ${totalHours !== null ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
                    {totalHours !== null && (
                      <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center gap-3.5">
                        <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0 shadow-2xs">
                          <Clock className="w-4 h-4 text-primary-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-[11px] font-medium text-slate-500">Время по плану</div>
                          <div className="text-sm font-bold text-slate-900 line-clamp-2 break-words" title={`${hoursLabel(totalHours)} занятий`}>{hoursLabel(totalHours)} занятий</div>
                        </div>
                      </div>
                    )}

                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0 shadow-2xs">
                        <GitBranch className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">Структура трека</div>
                        <div className="text-sm font-bold text-slate-900 line-clamp-2 break-words">
                          {development
                            ? "шаг развития"
                            : `${rj.action_plan.length} ${rj.action_plan.length === 1 ? "этап" : rj.action_plan.length < 5 ? "этапа" : "этапов"} освоения`}
                        </div>
                      </div>
                    </div>

                    <div className="p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 flex items-center gap-3.5">
                      <div className="w-9 h-9 rounded-lg bg-white border border-slate-200/80 flex items-center justify-center text-slate-700 flex-shrink-0 shadow-2xs">
                        <Target className="w-4 h-4 text-primary-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-slate-500">Стартовая точка</div>
                        <div className="text-sm font-bold text-slate-900 line-clamp-2 break-words" title={primaryStart}>
                          {primaryStart}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Vertical Timeline Journey ── */}
                <div className="relative pl-6 sm:pl-10 space-y-6 sm:space-y-8 py-2">
                  {/* Vertical Spine Line */}
                  <div className="absolute left-[23px] sm:left-[39px] top-6 bottom-6 w-0.5 bg-gradient-to-b from-primary-400 via-slate-300 to-emerald-400" />

                  {rj.action_plan.map((item, idx) => {
                    const isFirst = item.priority === 1 || idx === 0;
                    const hours = stepHours(item);

                    return (
                      <div key={item.priority || idx} className="relative flex items-start gap-4 sm:gap-6 group">
                        {/* Step Node */}
                        <div
                          className={`relative z-10 -ml-[23px] sm:-ml-[39px] w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl flex items-center justify-center font-black text-xs sm:text-sm flex-shrink-0 transition-transform group-hover:scale-105 ${
                            isFirst
                              ? "bg-primary-600 text-white shadow-md ring-4 ring-primary-100/80"
                              : "bg-white border-2 border-slate-300 text-slate-800 shadow-2xs"
                          }`}
                        >
                          {item.priority || idx + 1}
                        </div>

                        {/* Step Content Card */}
                        <div
                          className={`flex-1 min-w-0 rounded-2xl border transition-all p-4 sm:p-6 space-y-3.5 ${
                            isFirst
                              ? "bg-white border-primary-200/90 shadow-2xs hover:border-primary-300 ring-1 ring-primary-100/50"
                              : "bg-white border-slate-200/80 shadow-2xs hover:border-slate-300"
                          }`}
                        >
                          {/* Step Header */}
                          <div className="flex flex-wrap items-center justify-between gap-2.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                                  isFirst
                                    ? "bg-primary-50 text-primary-800 border-primary-200/80"
                                    : "bg-slate-100 text-slate-700 border-slate-200/80"
                                }`}
                              >
                                {isDevelopmentStep(item)
                                  ? "Шаг развития"
                                  : isFirst ? "Стартовый приоритет · Шаг 1" : `Шаг ${item.priority || idx + 1} · Развитие`}
                              </span>

                              {item.skill_name_ru && item.action_title && item.action_title !== item.skill_name_ru && (
                                <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200/70 px-2 py-0.5 rounded">
                                  {item.skill_name_ru}
                                </span>
                              )}
                            </div>

                            {hours !== null && (
                              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border border-slate-200/80 px-2.5 py-1 rounded-md">
                                <Clock className="w-3.5 h-3.5 text-slate-400" />
                                <span>{hoursLabel(hours)}</span>
                              </div>
                            )}
                          </div>

                          {/* Title */}
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-snug break-words">
                            {item.action_title || item.skill_name_ru}
                          </h3>

                          {/* Description / Practice Strategy */}
                          <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal break-words">
                            {(item.full_description || "")
                              .replace(
                                /(?:[\.\s,;–—-]*)?(?:Рекомендуем(?:ое|ый)?\s+(?:количество\s+часов|время|объем)|Время\s+на\s+отработку|Примерное\s+время)\s*:\s*\d+\s*(?:часов|часа|час|ч)?\.?$/i,
                                ""
                              )
                              .trim()}
                          </p>

                          {/* Milestone Criteria Footer (correction steps only) */}
                          {!isDevelopmentStep(item) && (
                            <div className="pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>Критерий освоения: серия из 5 задач подряд без ошибок перед переходом к следующей теме</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Final Milestone / Goal Node: a learning goal, not a promise of "full readiness" */}
                  {!development && planSkillNames.length > 0 && (
                    <div className="relative flex items-start gap-4 sm:gap-6 group">
                      <div className="relative z-10 -ml-[23px] sm:-ml-[39px] w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-md ring-4 ring-emerald-100/80 flex-shrink-0">
                        <Flag className="w-4 h-4" />
                      </div>

                      <div className="flex-1 min-w-0 rounded-2xl border border-emerald-200/90 bg-emerald-50/30 p-4 sm:p-6 shadow-2xs space-y-2" data-testid="diagnostic-report-plan-goal">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                            Цель плана
                          </span>
                        </div>
                        <h3 className="font-bold text-slate-900 text-sm sm:text-base break-words">
                          Решать задачи по темам плана в новом контексте
                        </h3>
                        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed break-words">
                          Темы: {planSkillNames.join("; ")}. Освоение каждой темы подтверждается решением новых задач; итог проверяется повторной диагностикой.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })()}

          </div>{/* /tabpanel */}

        </motion.div>
      )}
    </div>
  );
}
