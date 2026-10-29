import { branchesLabel, localeLabel, needsLabel, positionLabel, toolLabel } from "./labels";
import type { DemoRequest, OrgRequestInfo, RequestMail } from "./types";

/** One line of a card: a label and plain text.  Empty optional values are never turned into rows. */
export interface DetailRow {
  label: string;
  value: string;
}

const filled = (value: string | null | undefined): string | null => {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : null;
};
const rows = (...items: [string, string | null][]): DetailRow[] => items.filter((item): item is [string, string] => item[1] !== null).map(([label, value]) => ({ label, value }));

/** The K3 fields about the centre: type is drawn separately (`orgTypeLabel`), these are the optional ones. */
export function centreRows(r: Pick<DemoRequest, "address" | "branches_count" | "students_count">): DetailRow[] {
  return rows(
    ["Адрес", filled(r.address)],
    ["Филиалы", branchesLabel(r.branches_count)],
    ["Учеников", r.students_count === null || r.students_count === undefined ? null : String(r.students_count)],
  );
}

/** The position of the contact person («Должность»). */
export const positionRows = (r: Pick<DemoRequest, "position">): DetailRow[] => rows(["Должность", positionLabel(r.position)]);
/** The convenient time to call («Удобное время»). */
export const timeRows = (r: Pick<DemoRequest, "preferred_contact_time">): DetailRow[] => rows(["Удобное время", filled(r.preferred_contact_time)]);

/** Step 3 of the form: what the centre wants, what it uses now, where it heard of ALGO, the free comment. */
export function needRows(r: Pick<DemoRequest, "needs" | "current_tool" | "heard_from"> & { comment?: string | null }): DetailRow[] {
  return rows(
    ["Задачи", needsLabel(r.needs)],
    ["Пользуются сейчас", toolLabel(r.current_tool)],
    ["Откуда узнали", filled(r.heard_from)],
    ["Комментарий", filled(r.comment)],
  );
}

export function localeRows(r: Pick<DemoRequest, "locale">): DetailRow[] {
  // `ru` is the default of the form: only a different language is worth a line.
  return r.locale && r.locale !== "ru" ? rows(["Язык заявки", localeLabel(r.locale)]) : [];
}

const SOURCE_KEYS: [string, string][] = [
  ["utm_source", "utm_source"], ["utm_medium", "utm_medium"], ["utm_campaign", "utm_campaign"], ["utm_term", "utm_term"],
  ["utm_content", "utm_content"], ["referrer", "Реферер"], ["landing", "Страница входа"],
];
/** Every non-empty tag of the source («utm_medium: cpc», «Реферер: https://…»); the short form stays in the «Источник» row. */
export function sourceRows(source: Record<string, string> | null | undefined): DetailRow[] {
  if (!source) return [];
  return SOURCE_KEYS.map(([key, label]) => [label, filled(source[key])] as [string, string | null]).filter((item): item is [string, string] => item[1] !== null).map(([label, value]) => ({ label, value }));
}

export type MailMark = { key: string; text: string; short: string; problem: boolean };

/**
 * The marks of the two letters (K3_API §4 `mail`): what a person of the team must know.  A problem is `failed` / `cap`;
 * `pending` is a letter still on its way (shown only in the card, not as an alarm).  `null` / absent = a request from before K3.
 */
export function mailMarks(mail: RequestMail | null | undefined): MailMark[] {
  const marks: MailMark[] = [];
  if (!mail) return marks;
  if (mail.team === "failed") marks.push({ key: "team", text: "Письмо команде о новой заявке не ушло. Заявка сохранена и лежит здесь.", short: "письмо команде не ушло", problem: true });
  if (mail.team === "pending") marks.push({ key: "team-pending", text: "Письмо команде ещё отправляется.", short: "", problem: false });
  if (mail.applicant === "cap") marks.push({ key: "applicant", text: "Письмо заявителю не отправлено: достигнут суточный потолок писем на этот ящик.", short: "письмо заявителю: потолок", problem: true });
  if (mail.applicant === "failed") marks.push({ key: "applicant", text: "Письмо заявителю не ушло.", short: "письмо заявителю не ушло", problem: true });
  if (mail.applicant === "pending") marks.push({ key: "applicant-pending", text: "Письмо заявителю ещё отправляется.", short: "", problem: false });
  return marks;
}

/** Only the problems, in the short words of a list pill. */
export const mailProblems = (mail: RequestMail | null | undefined): MailMark[] => mailMarks(mail).filter((mark) => mark.problem);

/** The warning above «Одобрить»: the mailbox of an open request is already a login of ALGO. */
export const EMAIL_IN_ALGO_TITLE = "Эта почта уже есть в ALGO";
export const EMAIL_IN_ALGO_TEXT =
  "У этого адреса уже есть вход в платформу. Одобрение с этой почтой будет отклонено: укажите другую почту владельца в окне одобрения или сначала свяжитесь с заявителем.";

/** The «Из заявки» block of a centre: only the optional answers that were given (the date and the link are drawn by the card). */
export function centreRequestRows(r: OrgRequestInfo): DetailRow[] {
  return [
    ...positionRows(r),
    ...needRows({ needs: r.needs, current_tool: r.current_tool, heard_from: r.heard_from }),
    ...rows(["Филиалы", branchesLabel(r.branches_count)]),
    ...timeRows(r),
  ];
}
