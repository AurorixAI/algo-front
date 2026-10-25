"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import type { Lesson } from "@/lib/api";
import { businessWallTimeToInstant, formatIsoDateLabel } from "@/lib/business-time";
import { useAuthStore } from "@/lib/store";
import { useNow } from "@/lib/use-now";
import { MOVE_TOO_LATE_HINT, lessonStartMs, teacherMoveControl } from "@/lib/substitutions";
import { SCHEDULE_ACTION_LABEL } from "@/lib/schedule-card-actions";
import { LessonActionSheet } from "@/components/groups/lesson-action-sheet";

/** The lesson the control moves (the fields of the teacher's schedule occurrence). */
export interface MovableLesson {
  groupId: string;
  groupName?: string | null;
  lessonId: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  room?: string | null;
  format?: "offline" | "online";
  topic?: string | null;
}

/**
 * P1.1 on the lesson panel of the teacher: «Перенести урок» on his own future lesson - the dialog is the administrator's one
 * (`LessonActionSheet`, date / time / room / reason and the live check of the busy time).  In the last hour before the start the button gives way to
 * the hint (the server says `MOVE_TOO_LATE`); «Не смогу провести» stays next to it.
 */
export function TeacherMoveControl({
  lesson,
  lessonTeacherId,
  isSubstitution,
  lessonStatus,
  onDialogChange,
  onMoved,
}: {
  lesson: MovableLesson;
  lessonTeacherId?: string | null;
  isSubstitution?: boolean;
  lessonStatus: string | null | undefined;
  /** The page holds its own Escape key while a dialog is above it. */
  onDialogChange?: (open: boolean) => void;
  /** After the lesson was moved: the panel closes and the schedule is read again (the toast text goes with it). */
  onMoved: (text: string) => void;
}) {
  const { user } = useAuthStore();
  const now = useNow(30_000, true);
  const [open, setOpenState] = useState(false);
  const setOpen = (next: boolean) => { setOpenState(next); onDialogChange?.(next); };
  const control = teacherMoveControl({
    role: user?.org_role ?? user?.role ?? null,
    userId: user?.id,
    lessonTeacherId,
    isSubstitution,
    lessonStatus,
    startsAtMs: lessonStartMs(lesson.lessonDate, lesson.startTime, businessWallTimeToInstant),
    nowMs: now,
  });
  if (control.kind === "none") return null;
  if (control.kind === "late") return <p role="status" data-testid="move-late-hint" className="mb-4 text-xs font-medium text-slate-500">{MOVE_TOO_LATE_HINT}</p>;

  const sheetLesson: Lesson = {
    id: lesson.lessonId, date: lesson.lessonDate, startTime: lesson.startTime, endTime: lesson.endTime, room: lesson.room, format: lesson.format, topic: lesson.topic ?? undefined,
  };
  return (
    <div className="mb-4">
      <button
        type="button"
        data-testid="teacher-move"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-2xs transition-colors hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800"
      >
        <CalendarClock className="h-3.5 w-3.5 text-slate-400" />
        {SCHEDULE_ACTION_LABEL.reschedule}
      </button>
      <LessonActionSheet
        moveOnly
        aboveLessonPanel
        lesson={open ? sheetLesson : null}
        groupId={lesson.groupId}
        title={lesson.groupName || "Урок"}
        subtitle={`${formatIsoDateLabel(lesson.lessonDate, { weekday: "short", day: "numeric", month: "long" })} · ${lesson.startTime}–${lesson.endTime}`}
        teacherLine={null}
        actions={["reschedule"]}
        onClose={() => setOpen(false)}
        onChanged={(text) => { setOpen(false); onMoved(text); }}
        onRefresh={() => { setOpen(false); onMoved(""); }}
      />
    </div>
  );
}
