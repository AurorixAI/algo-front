/**
 * «Запрос демо»: маска телефона, проверка полей, тело запроса, разбор отказа сервера, метки источника (utm).
 *
 * ПЕРЕНОСИМЫЙ МОДУЛЬ (K3 P2, правило 39 LESSONS_LEARNED: логику не писать заново). Лендинг (algo-landing) копирует этот
 * файл как есть. Поэтому здесь НЕТ ни одного import, ни React, ни Next, ни window, ни process: только TypeScript
 * (тест tests/k3-p1-p3.test.cjs следит, что import не появится). Продукт использует отсюда телефон
 * (`lib/phone.ts` реэкспортирует) и `retryText`; сама форма «Запросить демо» теперь живёт на лендинге.
 *
 * Ошибка сервера принимается по форме, а не по классу (`DemoHttpFailure`): годится и `HttpError` продукта, и любая
 * ошибка собственного клиента лендинга с полями `status`, `message`, `fields`, `retryAfter`.
 */

// ---- Телефон: +998 XX XXX XX XX ---------------------------------------------------------------------------------

/**
 * Форматирование узбекского номера телефона: +998 XX XXX XX XX
 * Автоматически подставляет +998 и расставляет пробелы.
 */
export function formatUzPhone(value: string): string {
  // Оставляем только цифры
  let digits = value.replace(/\D/g, "");

  // Если начинается с 998 — убираем, чтобы работать с 9-значным "телом"
  if (digits.startsWith("998")) {
    digits = digits.slice(3);
  }

  // Ограничиваем 9 цифрами (после 998)
  digits = digits.slice(0, 9);

  // Если пусто — показываем только префикс +998
  if (digits.length === 0) return "+998 ";

  // Форматируем: +998 XX XXX XX XX
  let result = "+998";
  if (digits.length > 0) result += " " + digits.slice(0, 2);
  if (digits.length > 2) result += " " + digits.slice(2, 5);
  if (digits.length > 5) result += " " + digits.slice(5, 7);
  if (digits.length > 7) result += " " + digits.slice(7, 9);

  return result;
}

/**
 * Проверяет, является ли номер полным узбекским номером (12 цифр: 998 + 9)
 */
export function isValidUzPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length === 12 && digits.startsWith("998");
}

/** «через 40 с» / «через 5 мин» / «через 2 ч» for a wait in seconds. */
export function retryText(seconds: number | undefined | null): string {
  if (!seconds || seconds <= 0) return "чуть позже";
  if (seconds < 60) return `через ${Math.ceil(seconds)} с`;
  if (seconds < 3600) return `через ${Math.ceil(seconds / 60)} мин`;
  return `через ${Math.ceil(seconds / 3600)} ч`;
}

// ---- Форма ------------------------------------------------------------------------------------------------------

export interface DemoFormValues {
  fullName: string;
  centreName: string;
  city: string;
  phone: string;
  email: string;
  /** Digits only ("" = not given). */
  studentsCount: string;
  comment: string;
  /** The honeypot: a person never sees it, so never fills it. */
  website: string;
}

export const EMPTY_DEMO_FORM: DemoFormValues = {
  fullName: "",
  centreName: "",
  city: "",
  phone: "+998 ",
  email: "",
  studentsCount: "",
  comment: "",
  website: "",
};

export type DemoField = "fullName" | "centreName" | "city" | "phone" | "email" | "studentsCount" | "comment";
export type DemoErrors = Partial<Record<DemoField, string>>;

export const COMMENT_MAX = 2000;
export const STUDENTS_MAX = 100000;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/;

export function isValidEmail(value: string): boolean {
  const text = value.trim();
  return text.length <= 254 && EMAIL.test(text);
}

/** What the field shows while a person types or pastes a phone: «+998 90 123 45 67». */
export function maskPhone(typed: string): string {
  // A digit typed IN FRONT of the «+998 » prefix (the caret was at the start of the field) must not end up inside the number:
  // «9+998 » is «9» typed after the prefix.
  const text = typed.trimStart();
  const prefixAt = text.indexOf("+998");
  const withoutPrefix = prefixAt > 0 ? text.slice(0, prefixAt) + text.slice(prefixAt + 4) : text;
  return formatUzPhone(withoutPrefix);
}

/** The phone the server gets: «+998901234567». "" for an incomplete number. */
export function phoneForServer(value: string): string {
  return isValidUzPhone(value) ? `+${value.replace(/\D/g, "")}` : "";
}

/** Client-side check; the server stays the authority.  Messages are the ones a person sees under the field. */
export function validateDemoForm(values: DemoFormValues): DemoErrors {
  const errors: DemoErrors = {};
  const name = values.fullName.trim().replace(/\s+/g, " ");
  if (name.length < 2) errors.fullName = "Укажите, как к вам обращаться";
  else if (name.length > 120) errors.fullName = "Слишком длинное имя";
  const centre = values.centreName.trim();
  if (centre.length < 2) errors.centreName = "Укажите название центра";
  else if (centre.length > 200) errors.centreName = "Слишком длинное название";
  const city = values.city.trim();
  if (city.length < 2) errors.city = "Укажите город";
  else if (city.length > 100) errors.city = "Слишком длинное название города";
  if (!isValidUzPhone(values.phone)) errors.phone = "Введите номер полностью: +998 XX XXX XX XX";
  if (!values.email.trim()) errors.email = "Укажите почту";
  else if (!isValidEmail(values.email)) errors.email = "Проверьте почту: например, name@center.uz";
  if (values.studentsCount !== "") {
    const n = Number(values.studentsCount);
    if (!Number.isInteger(n) || n < 0 || n > STUDENTS_MAX) errors.studentsCount = `Число от 0 до ${STUDENTS_MAX}`;
  }
  if (values.comment.length > COMMENT_MAX) errors.comment = `Не больше ${COMMENT_MAX} символов`;
  return errors;
}

/** UTM tags and where the visit came from (the `source` object of API_CONTRACT.md §1: strings of at most 300 characters). */
export interface DemoSource {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  /** Host of the page the visitor came from (no path, no query: those may carry personal data). */
  referrer?: string;
  /** The page of the form. */
  landing?: string;
}

const SOURCE_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;
const SOURCE_VALUE_MAX = 300;

function cleanTag(value: string | null | undefined): string | undefined {
  // eslint-disable-next-line no-control-regex
  const text = (value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, SOURCE_VALUE_MAX);
  return text || undefined;
}

/**
 * Read the source from the address (`?utm_source=...`; `?ref=` / `?source=` of an invitation link count as `utm_source`
 * when it is absent) and the referrer.  `previous` (kept for the visit) fills what the address lacks.
 */
export function captureSource(search: string, referrer: string, ownHost: string, previous?: DemoSource | null): DemoSource {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const out: DemoSource = { ...(previous ?? {}) };
  for (const key of SOURCE_KEYS) {
    const value = cleanTag(params.get(key));
    if (value) out[key] = value;
  }
  const ref = cleanTag(params.get("ref") ?? params.get("source"));
  if (ref && !out.utm_source) out.utm_source = ref;
  if (!out.referrer && referrer) {
    try {
      const host = new URL(referrer).host;
      if (host && host !== ownHost) out.referrer = host.slice(0, SOURCE_VALUE_MAX);
    } catch {
      /* a referrer that is not a URL is ignored */
    }
  }
  return out;
}

/** `?utm_x=...` pairs of the current address, to carry through a redirect (old /register, /request-demo links). */
export function sourceQuery(search: string): string {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const kept = new URLSearchParams();
  for (const key of [...SOURCE_KEYS, "ref", "source"]) {
    const value = cleanTag(params.get(key));
    if (value) kept.set(key, value);
  }
  const text = kept.toString();
  return text ? `?${text}` : "";
}

/** The body of `POST /public/demo-requests` (field names of API_CONTRACT.md). */
export interface DemoRequestBody {
  contact_name: string;
  centre_name: string;
  city: string;
  phone: string;
  email: string;
  students_count?: number;
  comment?: string;
  source?: DemoSource;
  /** The honeypot field: always sent, empty for a person. */
  website: string;
}

export function buildDemoBody(values: DemoFormValues, source?: DemoSource): DemoRequestBody {
  const body: DemoRequestBody = {
    contact_name: values.fullName.trim().replace(/\s+/g, " "),
    centre_name: values.centreName.trim(),
    city: values.city.trim(),
    phone: phoneForServer(values.phone),
    email: values.email.trim().toLowerCase(),
    website: values.website,
  };
  if (values.studentsCount !== "") body.students_count = Number(values.studentsCount);
  const comment = values.comment.trim();
  if (comment) body.comment = comment;
  if (source && Object.keys(source).length) body.source = source;
  return body;
}

/** Server field names -> form fields. */
const FIELD_OF_SERVER: Record<string, DemoField> = {
  contact_name: "fullName",
  centre_name: "centreName",
  city: "city",
  phone: "phone",
  email: "email",
  students_count: "studentsCount",
  comment: "comment",
};

export type DemoFailure =
  | { kind: "fields"; errors: DemoErrors; message: string }
  | { kind: "rate_limited"; message: string; retryAfter?: number }
  | { kind: "network"; message: string }
  | { kind: "server"; message: string };

/** The shape of a failed request that this module understands (`HttpError` of the product has it; status 0 = no network). */
export interface DemoHttpFailure {
  status: number;
  message: string;
  fields?: Record<string, string>;
  retryAfter?: number;
}

function isHttpFailure(value: unknown): value is DemoHttpFailure {
  return typeof value === "object" && value !== null && typeof (value as DemoHttpFailure).status === "number";
}

/** What a failed submit means for the form: field messages (422), a wait (429), or a calm banner (network / 5xx). */
export function classifyDemoFailure(failure: unknown): DemoFailure {
  if (!isHttpFailure(failure)) {
    return { kind: "server", message: "Не удалось отправить заявку. Повторите попытку чуть позже." };
  }
  const error = failure;
  if (error.status === 422 || error.status === 400) {
    const errors: DemoErrors = {};
    for (const [name, text] of Object.entries(error.fields ?? {})) {
      const field = FIELD_OF_SERVER[name];
      if (field) errors[field] = text;
    }
    const matched = Object.keys(errors).length > 0;
    return {
      kind: "fields",
      errors,
      message: matched ? "Проверьте отмеченные поля." : error.message,
    };
  }
  if (error.status === 429) {
    return {
      kind: "rate_limited",
      retryAfter: error.retryAfter,
      message: `Заявок с вашего адреса сейчас слишком много. Попробуйте ещё раз ${retryText(error.retryAfter)}.`,
    };
  }
  if (error.status === 0) {
    return { kind: "network", message: "Нет связи с сервером. Ваши данные сохранены в форме — повторите отправку, когда появится интернет." };
  }
  return { kind: "server", message: "Не удалось отправить заявку. Данные сохранены в форме — повторите попытку чуть позже." };
}

/** Where the person goes from the «Заявка принята» screen. */
export const SUCCESS_STEPS = [
  "Мы пришлём письмо с подтверждением на вашу почту.",
  "Менеджер ALGO свяжется с вами в течение 1–2 рабочих дней.",
  "После короткого демо мы откроем доступ вашему центру.",
] as const;
