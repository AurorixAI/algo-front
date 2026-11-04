import { useEffect, useState } from "react";

/** The value after it has stood still for `delayMs` (the first value is at once): a dry run asked for every keystroke of an amount would be a flood. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return undefined;
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs, settled]);
  return settled;
}
