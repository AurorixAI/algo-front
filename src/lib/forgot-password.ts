/** «Забыли пароль» (/forgot-password): the pure parts, so that node:test loads them as they are. */
import { HttpError } from "./http-json";

export const FORGOT_NEUTRAL_TEXT = "Если такая почта зарегистрирована, мы отправили на неё ссылку. Проверьте «Спам» и что адрес такой же, как при входе.";
export const FORGOT_CAPTCHA_TEXT = "Не удалось пройти проверку. Обновите страницу и попробуйте ещё раз.";
export const FORGOT_WAIT_TEXT = "Письмо может идти несколько минут.";
const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function forgotEmailProblem(raw: string): string | null {
  const email = raw.trim();
  if (!email) return "Укажите почту";
  if (!EMAIL_SHAPE.test(email) || email.length > 255) return "Проверьте почту: нужен адрес вида name@school.uz";
  return null;
}

/** Whether the button may send: an address, and the Cloudflare token when the widget exists (`needsToken`). */
export function canSendForgot(email: string, token: string, needsToken: boolean): boolean {
  return forgotEmailProblem(email) === null && (!needsToken || token.length > 0);
}

/** What a failed answer says to a person (the answer to a good request is the same for every address and never an error). */
export function forgotErrorText(error: unknown): { text: string; resetWidget: boolean } {
  if (error instanceof HttpError) {
    if (error.code === "captcha_failed") return { text: FORGOT_CAPTCHA_TEXT, resetWidget: true };
    if (error.status === 429) return { text: error.message, resetWidget: true };
    return { text: error.message, resetWidget: true };
  }
  return { text: "Не удалось отправить запрос. Повторите попытку.", resetWidget: true };
}
