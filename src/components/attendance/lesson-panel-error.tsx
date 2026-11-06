import { Notice } from "../ui/notice";

/**
 * The server's answer to a failed lesson action (start, finish, cancel,
 * reschedule). The attendance list shows its own copy while marking; every
 * other step of the lesson panel shows this one, so no refusal is silent.
 */
export function LessonPanelError({ message }: { message: string | null }) {
  if (!message) return null;
  return <Notice variant="error" className="mb-4">{message}</Notice>;
}
