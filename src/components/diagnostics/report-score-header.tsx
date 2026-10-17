import React from "react";
import { Activity, AlertTriangle, CheckCircle2, Gauge, Target, TrendingDown, TrendingUp, XCircle, type LucideIcon } from "lucide-react";
import {
  formatSolvedMixed, normalizeStatus, toneForStatus,
  type LevelStatus,
} from "../../lib/diagnostic-level";

/**
 * Hero card of the diagnostic report. The level is the headline; the number of solved
 * tasks is context. There is deliberately NO percentage here (owner decision 13.10,
 * variant b): in the adaptive test the tasks get harder after correct answers, so the
 * share of correct answers is not the level, and «20 %» next to «Соответствует уровню»
 * read as a contradiction. Exams keep their percentages elsewhere.
 */

const LEVEL_ICON: Record<LevelStatus, LucideIcon> = {
  critical: AlertTriangle,
  below: TrendingDown,
  partial_gap: Activity,
  on_level: Target,
  above: TrendingUp,
};

/**
 * Level medallion: a closed ring in the level's tone with the level's glyph, no figure.
 * Same 112 px footprint as the former percentage ring, so the layout rhythm is unchanged.
 * Decorative (aria-hidden): the level is spelled out in words right beside it.
 */
export function LevelRing({ status }: { status?: string | null }) {
  const tone = toneForStatus(status);
  const code = normalizeStatus(status);
  const Icon = code ? LEVEL_ICON[code] : Gauge;
  return (
    <div data-testid="diagnostic-report-level-ring" aria-hidden="true" className="relative flex items-center justify-center w-28 h-28 flex-shrink-0">
      <svg viewBox="0 0 112 112" className="absolute inset-0 w-full h-full drop-shadow-sm">
        <circle cx="56" cy="56" r="46" fill="none" stroke={tone.track} strokeWidth="10" />
        <circle cx="56" cy="56" r="46" fill="none" stroke="currentColor" strokeWidth="4" className={tone.ring} />
      </svg>
      <div className="relative flex flex-col items-center text-center select-none">
        <Icon aria-hidden="true" className={`w-9 h-9 ${tone.ring}`} />
        <div className={`text-[9px] text-slate-500 font-bold tracking-widest uppercase mt-1 leading-tight${code ? "" : " max-w-[4.75rem]"}`}>
          {code ? "Уровень" : "Уровень не определён"}
        </div>
      </div>
    </div>
  );
}

export interface ReportScoreHeaderProps {
  /** Level status code (critical ... above); an unknown / missing one renders neutral. */
  status?: string | null;
  /** Level in words, e.g. «Соответствует уровню». */
  levelText?: string | null;
  solved?: number | null;
  total?: number | null;
  /** Counts for the wide-screen side cards (numbers only, no shares). */
  correct?: number | null;
  wrong?: number | null;
}

export function ReportScoreHeader({ status, levelText, solved, total, correct, wrong }: ReportScoreHeaderProps) {
  const tone = toneForStatus(status);
  const solvedText = formatSolvedMixed(solved, total);
  return (
    <div
      data-testid="diagnostic-report-score-card"
      className={`rounded-2xl border p-4 sm:p-6 shadow-sm relative overflow-hidden ${tone.cardBg} ${tone.cardBorder}`}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
        <LevelRing status={status} />

        {/* Level (headline) + context */}
        <div className="w-full min-w-0 flex flex-col items-center justify-center sm:w-auto sm:flex-1 sm:items-start">
          {levelText && (
            <div data-testid="diagnostic-report-level" className={`inline-flex max-w-full min-w-0 items-center gap-2.5 px-4 py-2 rounded-full text-sm font-bold border shadow-sm ${tone.badge}`}>
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${tone.ping}`} />
                <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${tone.dot}`} />
              </span>
              <span className="min-w-0 break-words text-center sm:text-left">{levelText}</span>
            </div>
          )}
          <div className="mt-2 flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-slate-600 sm:justify-start">
            {solvedText && <span data-testid="diagnostic-report-solved" className="min-w-0 break-words text-center sm:text-left">{solvedText}</span>}
          </div>
        </div>

        {/* Right stat cards (counts) */}
        <div className="hidden xl:flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur border border-emerald-100 rounded-2xl shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-emerald-100/80 flex items-center justify-center text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-black text-slate-900 leading-none">{correct ?? "—"}</div>
              <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mt-1">Верных</div>
            </div>
          </div>

          <div className="flex items-center gap-3 px-4 py-3 bg-white/90 backdrop-blur border border-rose-100 rounded-2xl shadow-sm">
            <div className="w-9 h-9 rounded-xl bg-rose-100/80 flex items-center justify-center text-rose-600">
              <XCircle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-lg font-black text-slate-900 leading-none">{wrong ?? "—"}</div>
              <div className="text-[10px] font-bold text-rose-600 uppercase tracking-wider mt-1">Ошибок</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
