/** Validation of the console's forms: plain functions (the server stays the authority; these keep a person from a round trip). */
import { isValidEmail } from "@/lib/demo-request";

export const MIN_STAFF_PASSWORD = 12;
export const MAX_PASSWORD = 128;

export type Errors<K extends string> = Partial<Record<K, string>>;

export function validateLogin(v: { email: string; password: string }): Errors<"email" | "password"> {
  const e: Errors<"email" | "password"> = {};
  if (!v.email.trim()) e.email = "Введите почту";
  else if (!isValidEmail(v.email)) e.email = "Проверьте почту";
  if (!v.password) e.password = "Введите пароль";
  return e;
}

export function validateNewPassword(v: { current: string; next: string; confirm: string }): Errors<"current" | "next" | "confirm"> {
  const e: Errors<"current" | "next" | "confirm"> = {};
  if (!v.current) e.current = "Введите текущий (временный) пароль";
  if (v.next.length < MIN_STAFF_PASSWORD) e.next = `Не меньше ${MIN_STAFF_PASSWORD} символов`;
  else if (v.next.length > MAX_PASSWORD) e.next = `Не больше ${MAX_PASSWORD} символов`;
  else if (v.next === v.current) e.next = "Новый пароль должен отличаться от текущего";
  if (v.confirm !== v.next) e.confirm = "Пароли не совпадают";
  return e;
}

export interface StaffFormValues {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string;
  password: string;
}

export function validateStaff(v: StaffFormValues): Errors<keyof StaffFormValues> {
  const e: Errors<keyof StaffFormValues> = {};
  if (!v.firstName.trim()) e.firstName = "Укажите имя";
  if (!v.lastName.trim()) e.lastName = "Укажите фамилию";
  if (!v.email.trim()) e.email = "Укажите почту (это логин)";
  else if (!isValidEmail(v.email)) e.email = "Проверьте почту";
  if (!v.roleId) e.roleId = "Выберите роль";
  if (v.password.length < MIN_STAFF_PASSWORD) e.password = `Не меньше ${MIN_STAFF_PASSWORD} символов`;
  else if (v.password.length > MAX_PASSWORD) e.password = `Не больше ${MAX_PASSWORD} символов`;
  return e;
}

/** A password the owner can read out to a colleague: 16 characters, no look-alikes (0/O, 1/l/I), at least one of each kind. */
export function generatePassword(random: (max: number) => number = secureRandom): string {
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const symbols = "-_.!#";
  const all = lower + upper + digits;
  const pick = (set: string) => set[random(set.length)];
  const chars = [pick(lower), pick(upper), pick(digits), pick(symbols)];
  while (chars.length < 16) chars.push(pick(all));
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = random(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

function secureRandom(max: number): number {
  const buffer = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / max) * max;
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % max;
}

export const REASON_MIN = 3;
export const REASON_MAX = 500;

/** A required reason (block a centre or a user): 3..500 characters. */
export function validateReason(value: string): string | null {
  const text = value.trim();
  if (text.length < REASON_MIN) return `Опишите причину (не меньше ${REASON_MIN} символов)`;
  if (text.length > REASON_MAX) return `Не больше ${REASON_MAX} символов`;
  return null;
}

export function validateNote(value: string): string | null {
  const text = value.trim();
  if (!text) return "Введите текст заметки";
  if (text.length > 2000) return "Не больше 2000 символов";
  return null;
}

export const LIMITS = { students: { min: 1, max: 100000 }, teachers: { min: 1, max: 10000 } } as const;

export function validateLimits(v: { students: string; teachers: string }): Errors<"students" | "teachers"> {
  const e: Errors<"students" | "teachers"> = {};
  const check = (text: string, min: number, max: number) => {
    const n = Number(text);
    return text.trim() !== "" && Number.isInteger(n) && n >= min && n <= max;
  };
  if (!check(v.students, LIMITS.students.min, LIMITS.students.max)) e.students = `Число от ${LIMITS.students.min} до ${LIMITS.students.max}`;
  if (!check(v.teachers, LIMITS.teachers.min, LIMITS.teachers.max)) e.teachers = `Число от ${LIMITS.teachers.min} до ${LIMITS.teachers.max}`;
  return e;
}

/** A warning shown BEFORE saving when a limit is set under the current number (the server saves it anyway and warns again). */
export function limitWarnings(v: { students: string; teachers: string }, current: { students: number; teachers: number }): string[] {
  const out: string[] = [];
  const students = Number(v.students);
  const teachers = Number(v.teachers);
  if (Number.isInteger(students) && students > 0 && students < current.students) out.push(`Лимит учеников (${students}) ниже текущего числа (${current.students}).`);
  if (Number.isInteger(teachers) && teachers > 0 && teachers < current.teachers) out.push(`Лимит учителей (${teachers}) ниже текущего числа (${current.teachers}).`);
  return out;
}

export function validateRoleName(value: string): string | null {
  const text = value.trim();
  if (!text) return "Введите название роли";
  if (text.length > 80) return "Не больше 80 символов";
  return null;
}

/** Permission keys of a role after a checkbox is switched: the key in or out, the order of the catalogue kept. */
export function togglePermission(selected: string[], key: string, on: boolean, catalogue: string[]): string[] {
  const set = new Set(selected);
  if (on) set.add(key);
  else set.delete(key);
  return catalogue.filter((item) => set.has(item));
}

export function samePermissions(a: string[], b: string[]): boolean {
  return a.length === b.length && [...a].sort().every((key, index) => key === [...b].sort()[index]);
}
