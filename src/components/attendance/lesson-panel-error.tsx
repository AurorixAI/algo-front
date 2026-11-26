import { Notice } from "../ui/notice";

/**
 * The server's answer to a failed lesson action (start, finish, cancel,
 * reschedule). The attendance list shows its own copy while marking; every
 * other step of the lesson panel shows this one, so no refusal is silent.
 */
/**
 * LESSON-RULES Э5: `info` - the refusal is a RULE of the centre (a lesson older than the window, a lesson nobody came to written afterwards), not a failure: an ordinary information notice, no red.
 */
export function LessonPanelError({ message, info = false }: { message: string | null; info?: boolean }) {
  if (!message) return null;
  return info
    ? <Notice variant="info" role="alert" testId="lesson-rule-refusal" className="mb-4">{message}</Notice>
    : <Notice variant="error" className="mb-4">{message}</Notice>;
}
