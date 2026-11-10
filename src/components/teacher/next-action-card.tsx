"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight, CheckCircle2, ClipboardCheck, Clock, Play, Radio } from "lucide-react";
import { formatIsoDateLabel } from "@/lib/business-time";
import { formatCountdown, moreTodayText, startsInText, type AgendaLessonLike, type NextStep } from "@/lib/teacher-agenda";
import { Button } from "@/components/ui/button";
import { buttonClass } from "@/lib/button-style";

/** What the card needs of a lesson action of the dashboard (`LessonAction`). */
export interface CardAction {
  lesson: AgendaLessonLike;
  tone: "rose" | "amber" | "emerald";
  actionType?: "in_progress" | "missed";
  label: string;
  description: string;
  cardLabel?: string;
  cardDescription?: string;
}

/** What the card needs of an exam of the dashboard (`LiveExamDashboardSummary` with the clock). */
export interface CardExam {
  exam_id: string;
  title: string;
  group_name?: string | null;
  delivery_mode?: string | null;
  scheduled_lesson_date?: string | null;
  displayRemainingSeconds: number;
}

type Tone = "rose" | "amber" | "emerald" | "slate" | "primary";

export const ICON_TONE: Record<Tone, string> = {
  // `rose` is the rank «overdue»; it is SHOWN as a warning (red is for errors and debts)
  rose: "bg-warning-100 text-warning-700",
  amber: "bg-amber-100 text-amber-700",
  emerald: "bg-emerald-100 text-emerald-700",
  slate: "bg-slate-100 text-slate-600",
  primary: "bg-primary-100 text-primary-700",
};

const examLine = (exam: CardExam) => `${exam.title}${exam.group_name ? ` · ${exam.group_name}` : ""}`;

/** The words of the card for the step `pickNextStep` chose. */
export function nextStepView<A extends CardAction, L extends AgendaLessonLike>(step: NextStep<A, L, CardExam>): { tone: Tone; title: string; description: string } {
  switch (step.kind) {
    case "action":
      return { tone: step.action.tone, title: step.action.cardLabel || step.action.label, description: step.action.cardDescription || step.action.description };
    case "upcoming":
      return { tone: "slate", title: `Ближайший урок ${step.entry.lesson.startTime} · ${step.entry.lesson.groupName}`, description: startsInText(step.entry.minutesToStart) };
    case "exam_active": {
      const print = step.exam.delivery_mode === "print";
      return {
        tone: "primary",
        title: print ? "Сейчас проводится печатный экзамен" : "Сейчас проводится экзамен",
        description: `${examLine(step.exam)}.${print ? " Проводится на бумаге." : ""} Осталось ${formatCountdown(step.exam.displayRemainingSeconds)}.`,
      };
    }
    case "exam_attention":
      return { tone: "amber", title: "Нужно решить по экзамену", description: `${examLine(step.exam)}. ${step.exam.scheduled_lesson_date ? "Занятие прошло, а экзамен не проведён." : "Экзамен не проведён."}` };
    case "failed":
      return { tone: "slate", title: "Не удалось загрузить", description: "Не получилось проверить уроки на сегодня. Попробуйте ещё раз." };
    default:
      return { tone: "emerald", title: "На сегодня всё закрыто", description: "Нет незавершённых уроков или отметок, требующих вашего внимания." };
  }
}

/** The sign of the step by its MEANING: a missed lesson «!», a lesson to start «play», a journal to finish a clipboard, the next lesson a clock, an exam a signal, a failure «!», all done a tick. */
export function nextStepIcon<A extends CardAction, L extends AgendaLessonLike>(step: NextStep<A, L, CardExam>) {
  if (step.kind === "action") {
    const missed = step.action.actionType === "missed" || (step.action.tone === "rose" && step.action.actionType !== "in_progress");
    return missed ? AlertCircle : step.action.tone === "emerald" ? Play : ClipboardCheck;
  }
  return step.kind === "exam_attention" ? ClipboardCheck : step.kind === "upcoming" ? Clock : step.kind === "exam_active" ? Radio : step.kind === "failed" ? AlertCircle : CheckCircle2;
}

/** «Следующий: чт, 29.10, 14:00 · Группа» under «На сегодня всё закрыто»; null for any other step. */
export function laterLine<A extends CardAction, L extends AgendaLessonLike>(step: NextStep<A, L, CardExam>): string | null {
  return step.kind === "closed" && step.later
    ? `Следующий: ${formatIsoDateLabel(step.later.date, { weekday: "short", day: "2-digit", month: "2-digit" })}, ${step.later.startTime} · ${step.later.groupName}`
    : null;
}

/**
 * #158: the card «Ближайшее действие» of the teacher's dashboard - the step is chosen by `pickNextStep` (one rule), this component only says it:
 * a task (red / amber), «Дальше: группа · 15:00» (neutral) with «через 40 мин» and «и ещё N сегодня», an exam, «Не удалось загрузить», «На сегодня всё закрыто» with the next lesson.
 */
export function NextActionCard<A extends CardAction, L extends AgendaLessonLike>({ step, hint, onOpenAction, onOpenLesson, onRetry }: {
  step: NextStep<A, L, CardExam>;
  /** «Пока нет решения — урок проводите вы» for the lesson of the card with a waiting request. */
  hint: string | null;
  onOpenAction: (action: A) => void;
  onOpenLesson: (lesson: L) => void;
  onRetry: () => void;
}) {
  const view = nextStepView(step);
  const later = laterLine(step);
  const more = step.kind === "upcoming" ? moreTodayText(step.more) : null;
  const Icon = nextStepIcon(step);
  return (
    <div data-testid="next-action-card" data-step={step.kind} className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary-50/80" />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${ICON_TONE[view.tone]}`}>
            <Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-500">Ближайшее действие</p>
            <h2 data-testid="next-action-title" className="mt-1 text-xl font-bold text-slate-900">{view.title}</h2>
            <p data-testid="next-action-description" title={view.description} className="mt-1 truncate text-sm leading-6 text-slate-600">{view.description}</p>
            {hint && <p data-testid="today-pending-hint-card" className="mt-1 text-sm font-medium text-amber-800">{hint}</p>}
            {later && <p data-testid="next-lesson-later" className="mt-1 text-sm font-medium text-slate-700">{later}</p>}
            {more && <Link data-testid="more-today" href="/teacher/schedule" className="mt-1 inline-block text-sm font-semibold text-primary-700 hover:text-primary-800">{more}</Link>}
          </div>
        </div>
        {step.kind === "action" ? (
          <Button type="button" onClick={() => onOpenAction(step.action)}>Открыть урок <ArrowRight className="h-4 w-4" /></Button>
        ) : step.kind === "upcoming" ? (
          <Button type="button" onClick={() => onOpenLesson(step.entry.lesson)}>Открыть урок <ArrowRight className="h-4 w-4" /></Button>
        ) : step.kind === "exam_active" || step.kind === "exam_attention" ? (
          <Link href={`/teacher/exams/${step.exam.exam_id}`} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-700">Открыть экзамен <ArrowRight className="h-4 w-4" /></Link>
        ) : step.kind === "failed" ? (
          <Button type="button" variant="secondary" onClick={onRetry}>Повторить</Button>
        ) : (
          <Link href="/teacher/schedule" className={buttonClass({ variant: "secondary" })}>Открыть расписание <ArrowRight className="h-4 w-4" /></Link>
        )}
      </div>
    </div>
  );
}
