import { MessageSquare } from "lucide-react";

/** The words of a person in a row of «Замены» (a waiting cancellation, an entry of the history, a decided request): a comment mark and the words cut with «…» after two lines, never a chip (the whole text is in the tooltip). */
export function ReasonWords({ text, testId = "reason-words" }: { text: string; testId?: string }) {
  return (
    <p data-testid={testId} data-allow-hscroll="" title={text} className="flex min-w-0 items-start gap-1.5 text-sm text-slate-700">
      <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <span className="min-w-0 break-words line-clamp-2">{text}</span>
    </p>
  );
}
