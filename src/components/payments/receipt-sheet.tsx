import type { ReactNode } from "react";

/**
 * The pieces of a printed sheet of money that the receipt of a payment and the receipt of a refund share (Money-1 V): the A5 paper, the head of the centre, the title row, a row of «what — value», the sum with its words,
 * the signature, the stamps and the line «не фискальный чек».  The page chrome (menu, buttons) is `print:hidden`; the sheet is at most an A5 width, so it prints the same on A5 and on A4.
 */
export function SheetPaper({ label, children }: { label: string; children: ReactNode }) {
  return (
    <article
      aria-label={label}
      className="relative mx-auto w-full max-w-[148mm] overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 text-slate-900 shadow-sm sm:p-8 print:break-inside-avoid print:rounded-none print:border-slate-400 print:p-6 print:shadow-none"
    >
      {children}
    </article>
  );
}

export function SheetHead({ orgName, place, reserveRight = false }: { orgName: string; place: string; /** The «КОПИЯ» stamp stands in the corner: the name does not run under it. */ reserveRight?: boolean }) {
  return (
    <header className={`border-b border-slate-200 pb-4${reserveRight ? " pr-24" : ""}`}>
      <p className="break-words text-lg font-bold leading-snug">{orgName}</p>
      {place && <p className="mt-0.5 break-words text-xs text-slate-500">{place}</p>}
    </header>
  );
}

export function SheetTitleRow({ title, date, issued }: { title: string; date: string; issued?: string | null }) {
  return (
    <>
      <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-slate-600">{date}</p>
      </div>
      {issued && <p className="mt-0.5 text-xs text-slate-500" data-testid="sheet-issued">{issued}</p>}
    </>
  );
}

export function SheetRow({ label, children, strong = false }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`break-words ${strong ? "font-semibold" : "font-medium"}`}>{children}</dd>
    </div>
  );
}

export function SheetAmount({ label, amount, words }: { label: string; amount: string; words?: string | null }) {
  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 print:bg-transparent">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{amount}</p>
      {words && <p className="mt-0.5 text-sm text-slate-700">{words}</p>}
    </div>
  );
}

/** «Принял» / «Выдал(а)» on the left, the line for the signature on the right. */
export function SheetSignature({ label, name, signature }: { label: string; name: string; signature: string }) {
  return (
    <div className="mt-8 grid grid-cols-1 gap-x-8 gap-y-6 text-sm sm:grid-cols-2">
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 break-words font-medium">{name || "—"}</p>
      </div>
      <div>
        <div className="h-8 border-b border-slate-400" aria-hidden />
        <p className="mt-1 text-xs text-slate-500">{signature}</p>
      </div>
    </div>
  );
}

/** The red stamp across the sheet («Оплата отменена», «Возврат отменён»): a frame and a word, so it reads in black on paper too. */
export function SheetVoidStamp({ title, line }: { title: string; line?: string | null }) {
  return (
    <div
      role="note"
      className="pointer-events-none absolute right-4 top-24 max-w-[75%] -rotate-6 rounded-lg border-4 border-rose-600/80 bg-white/70 px-4 py-2 text-center text-rose-700 print:border-slate-800 print:text-slate-900"
    >
      <p className="text-xl font-extrabold tracking-wider sm:text-2xl">{title}</p>
      {line && <p className="mt-0.5 break-words text-xs font-semibold">{line}</p>}
    </div>
  );
}

/** «КОПИЯ»: the stamp of every print after the first, in the top right corner; a frame and a word (not a colour), printed. */
export function SheetCopyStamp({ text }: { text: string }) {
  return (
    <p
      data-testid="receipt-copy-stamp"
      className="absolute right-4 top-4 rounded-md border-2 border-slate-700 px-2.5 py-0.5 text-xs font-extrabold tracking-[0.2em] text-slate-700 print:border-slate-900 print:text-slate-900"
    >
      {text}
    </p>
  );
}

/** «Не является фискальным чеком»: small, and printed. */
export function SheetDisclaimer({ text }: { text: string }) {
  return <p className="mt-6 border-t border-slate-200 pt-3 text-xs text-slate-500 print:border-slate-300 print:text-slate-600" data-testid="sheet-disclaimer">{text}</p>;
}
