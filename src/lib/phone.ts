import { formatUzPhone, isValidUzPhone } from "./portable/demo-form";

// ONE copy of the mask and of the check: the portable module is what the landing copies as is (K3 P2, rule 39).
export { formatUzPhone, isValidUzPhone };

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
