"use client";

import { useToast } from "@/components/ui/toast";
import type { SubstitutionRequestMark } from "@/lib/substitution-types";
import { RequestControl } from "@/components/substitutions/request-control";
import { TeacherMoveControl, type MovableLesson } from "@/components/substitutions/teacher-move-control";

/**
 * What the teacher can do with his own future lesson, on the lesson panel of the dashboard and of the schedule: «Не смогу провести»
 * (LOGIC-B2) and «Перенести урок» (P1.1).  The panel hands over what its journal read says; both controls keep to their own rules.
 */
export function TeacherLessonControls({
  lesson, mark, lessonTeacherId, isSubstitution, lessonStatus, onChanged, onMoved, onDialogChange,
}: {
  lesson: MovableLesson;
  mark: SubstitutionRequestMark | null | undefined;
  lessonTeacherId?: string | null;
  isSubstitution?: boolean;
  lessonStatus: string | null | undefined;
  /** A request was sent or withdrawn: the panel's page refreshes its numbers. */
  onChanged: () => void;
  /** The lesson was moved (the toast is shown here): the panel closes and the page reads the schedule again. */
  onMoved: () => void;
  /** The move dialog is above the panel: the page's Escape key leaves the panel alone. */
  onDialogChange: (open: boolean) => void;
}) {
  const { showToast } = useToast();
  return (
    <>
      <RequestControl lesson={lesson} mark={mark} lessonTeacherId={lessonTeacherId} lessonStatus={lessonStatus} onChanged={onChanged} />
      <TeacherMoveControl lesson={lesson} lessonTeacherId={lessonTeacherId} isSubstitution={isSubstitution} lessonStatus={lessonStatus} onDialogChange={onDialogChange} onMoved={(text) => { if (text) showToast(text); onMoved(); }} />
    </>
  );
}
