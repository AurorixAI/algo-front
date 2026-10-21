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

/** A stored phone for display: a full Uzbek number as «+998 90 123 45 67», anything else exactly as stored. */
export function displayPhone(value: string | null | undefined): string {
  if (!value) return "";
  return isValidUzPhone(value) ? formatUzPhone(value) : value;
}

/**
 * `tel:` link for a stored phone («+998 90 123 45 67», «90 123-45-67»), or null when there is nothing
 * dialable (empty, or fewer than 7 digits). Spaces and punctuation are dropped; a leading «+» is kept.
 */
export function telHref(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) return null;
  return `tel:${raw.startsWith("+") ? "+" : ""}${digits}`;
}
