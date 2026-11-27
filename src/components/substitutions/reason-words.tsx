import { MessageSquare } from "lucide-react";

/** The words of a person in a row of «Замены» (a waiting cancellation, an entry of the history, a decided request): a comment mark and the line cut with «…», never a chip. */
export function ReasonWords({ text, testId = "reason-words" }: { text: string; testId?: string }) {
  return (
    <p data-testid={testId} data-allow-hscroll="" title={text} className="flex min-w-0 items-center gap-1.5 text-sm text-slate-700">
      <MessageSquare className="h-4 w-4 shrink-0 text-slate-500" aria-hidden />
      <span className="min-w-0 truncate">{text}</span>
    </p>
  );
}
