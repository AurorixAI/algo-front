/** Money-1 A3: under the divisor form after a change - the saved sheets it now moves («Ведомость Каримова К., октябрь 2026 г.: +50 000 сум к сохранённой — пересохраните её»). */
export function DivisorEffects({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <ul data-testid="divisor-effects" aria-label="Что изменилось в ведомостях" className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
      {lines.map((line) => <li key={line}>{line}</li>)}
    </ul>
  );
}
