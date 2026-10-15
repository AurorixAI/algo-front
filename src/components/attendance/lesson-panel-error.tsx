import { AlertCircle } from "lucide-react";

/**
 * The server's answer to a failed lesson action (start, finish, cancel,
 * reschedule). The attendance list shows its own copy while marking; every
 * other step of the lesson panel shows this one, so no refusal is silent.
 */
export function LessonPanelError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold leading-5 text-rose-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
      <span>{message}</span>
    </div>
  );
}
