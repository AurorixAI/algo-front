import Link from "next/link";
import { MARK_TONE_CLASS, type LessonMark } from "@/lib/substitutions";

/** Small state chips on a lesson (LOGIC-B2): «Замена: 9-А», «Вы запросили замену», «Ждёт замены», «Урок перенесён на …».  A chip with a request id leads to it. */
export function LessonChips({
  marks,
  requestHref,
  className = "",
}: {
  marks: LessonMark[];
  /** Where a chip with `requestId` leads (the page of the requests of the role); without it every chip is plain text. */
  requestHref?: (requestId: string) => string;
  className?: string;
}) {
  if (marks.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {marks.map((mark) => {
        const classes = `inline-flex max-w-full items-center truncate rounded-md px-1.5 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${MARK_TONE_CLASS[mark.tone]}`;
        return mark.requestId && requestHref ? (
          <Link key={mark.text} href={requestHref(mark.requestId)} onClick={(event) => event.stopPropagation()} className={`${classes} underline-offset-2 hover:underline`} title="Открыть запрос">
            {mark.text}
          </Link>
        ) : (
          <span key={mark.text} className={classes}>{mark.text}</span>
        );
      })}
    </span>
  );
}
