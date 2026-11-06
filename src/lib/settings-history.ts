/**
 * Money-1 B9: the journal of the money settings of the centre (`GET /org/settings/payments/history`, the owner only): who changed the way to count, the day of the shared month, the size of a package, the
 * recalculation for the lessons the centre cancelled or the start of the accounting - and what it did, in sums.  The sentence of every record is the server's (`text`); the lines of the students are
 * `details.items[].text`.  Pure: no React, no network.
 */
import { formatUtcNaiveAsBusinessDateTime } from "./business-time";
import { tidyMoneyText } from "./money-format";

export type SettingsAuditAction = "billing_regime_changed" | "centre_cancel_recalc_changed" | "accounting_start_changed";

export interface SettingsHistoryEntry {
  id: string;
  /** «06.11.2026 10:15» (the Tashkent clock). */
  when: string;
  actor: string;
  action: string;
  /** The title of the kind of change («Способ оплаты», «Перерасчёт за отмены центра», «Начало учёта»). */
  kind: string;
  text: string;
  /** The students the change moved (up to 50): the lines of the server. */
  lines: string[];
  linesMore: number;
}

export const SETTINGS_HISTORY_TITLE = "Журнал настроек оплат";
export const SETTINGS_HISTORY_EMPTY = "Пока записей нет: журнал покажет, кто и когда менял способ оплаты, день общего месяца, перерасчёт и начало учёта.";
export const SETTINGS_HISTORY_FAILED = "Не удалось загрузить журнал";

const KIND: Record<string, string> = {
  billing_regime_changed: "Способ оплаты",
  centre_cancel_recalc_changed: "Перерасчёт за отмены центра",
  accounting_start_changed: "Начало учёта оплат",
};

export function settingsHistoryOf(raw: unknown): SettingsHistoryEntry[] {
  const items = Array.isArray((raw as { items?: unknown } | null)?.items) ? ((raw as { items: unknown[] }).items) : [];
  return items.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>;
    const details = (r.details && typeof r.details === "object" ? r.details : {}) as Record<string, unknown>;
    const all = Array.isArray(details.items) ? (details.items as Array<Record<string, unknown>>).map((line) => String(line?.text ?? "")).filter(Boolean) : [];
    const total = Number(details.items_total);
    const action = String(r.action ?? "");
    return {
      id: String(r.id ?? ""),
      when: formatUtcNaiveAsBusinessDateTime(typeof r.at === "string" ? r.at : null),
      actor: String(r.actor_name ?? "").trim() || "—",
      action,
      kind: KIND[action] ?? "Настройки оплат",
      text: tidyMoneyText(String(r.text ?? "")),
      lines: all.map((line) => tidyMoneyText(line)),
      linesMore: Number.isFinite(total) && total > all.length ? total - all.length : 0,
    };
  });
}
