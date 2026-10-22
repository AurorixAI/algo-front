/**
 * IA audit F32 / F15: a new diagnostic invite for an EXISTING student (administrator only: diagnostics and exams are not the owner's, owner decision
 * 22.10) and the link of a waiting one.  Pure: no React, so node:test loads it.  The server already creates it
 * (`POST /auth/org/diagnostics {student_id, class_level, diagnostic_type}`, the second step of «Новый ученик»).
 */

export type DiagnosticKind = "initial" | "recheck" | "pre_exam";

export const DIAGNOSTIC_KIND_LABEL: Record<DiagnosticKind, string> = {
  initial: "Первичная диагностика",
  recheck: "Повторная диагностика",
  pre_exam: "Предэкзаменационная диагностика",
};

export const NEW_DIAGNOSTIC_LABEL = "Новая диагностика…";

/** «Первичная» for a student who has never been diagnosed, else «Повторная». */
export function defaultDiagnosticKind(diagnostics: ReadonlyArray<{ status: string }>): DiagnosticKind {
  return diagnostics.some((item) => item.status === "completed") ? "recheck" : "initial";
}

/** The link the student opens: `/d/<code>` on this site. */
export function diagnosticLink(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, "")}/d/${code}`;
}

/** An invite that can still be sent to the student (waiting for him or ready to start): its link is worth copying. */
export function isShareableInvite(status: string): boolean {
  return status === "pending" || status === "confirmed";
}

export function shareUrls(link: string): { whatsapp: string; telegram: string } {
  return {
    whatsapp: `https://wa.me/?text=${encodeURIComponent(`Пройдите диагностику по математике: ${link}`)}`,
    telegram: `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("Пройдите диагностику по математике")}`,
  };
}

/** Who may create or hand out diagnostics: the administrator's workspace only (never the owner's, never a teacher's). */
export function diagnosticsAllowed(input: { workspace: "owner" | "admin" | "teacher"; archived: boolean }): boolean {
  return input.workspace === "admin" && !input.archived;
}
