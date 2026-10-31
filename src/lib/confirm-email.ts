/** «Подтвердить новый адрес» (/confirm-email/[token]): the states of the page as pure functions. */
import { HttpError } from "./http-json";
import type { EmailChangeInfo } from "./onboarding-api";

export type ConfirmState =
  | { kind: "loading" }
  | { kind: "valid"; newEmail: string; centre: string; name: string }
  | { kind: "dead"; code: "used" | "expired" | "revoked" | "invalid" }
  | { kind: "closed"; message: string }
  | { kind: "taken" }
  | { kind: "unavailable"; message: string };

export function confirmStateFromInfo(info: EmailChangeInfo): ConfirmState {
  return { kind: "valid", newEmail: info.new_email, centre: (info.org_name ?? "").trim(), name: (info.first_name ?? "").trim() };
}

export function confirmStateFromError(error: unknown): ConfirmState {
  if (!(error instanceof HttpError)) return { kind: "unavailable", message: "Не удалось проверить ссылку. Повторите попытку." };
  const code = (error.code ?? "").toLowerCase();
  if (code === "link_used") return { kind: "dead", code: "used" };
  if (code === "link_revoked") return { kind: "dead", code: "revoked" };
  if (code === "link_expired" || error.status === 410) return { kind: "dead", code: "expired" };
  if (code === "link_not_found" || error.status === 404) return { kind: "dead", code: "invalid" };
  if (code === "email_taken") return { kind: "taken" };
  if (code === "access_closed") return { kind: "closed", message: error.message };
  return { kind: "unavailable", message: error.message };
}

export const CONFIRM_DEAD_COPY: Record<"used" | "expired" | "revoked" | "invalid", { title: string; text: string }> = {
  used: { title: "Адрес уже подтверждён", text: "Войдите с новой почтой и прежним паролем." },
  expired: { title: "Срок ссылки истёк", text: "Попросите владельца центра отправить ссылку ещё раз. До подтверждения вы входите со старой почтой." },
  revoked: { title: "Ссылка больше не действует", text: "Смену почты запросили заново или пароль изменился. Попросите владельца центра отправить ссылку ещё раз." },
  invalid: { title: "Ссылка не найдена", text: "Возможно, она скопирована не полностью. Откройте письмо от ALGO ещё раз." },
};

export const CONFIRM_CAPTION = "Смена почты для входа";

export const CONFIRM_TAKEN_COPY = { title: "Этот адрес уже используется", text: "Попросите владельца центра указать другой адрес. До подтверждения вы входите со старой почтой." };
