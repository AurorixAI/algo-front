// One `Idempotency-Key` for the whole front (payments, payouts, pauses, openings, support): ALWAYS a UUID v4.
// The server types the header as `UUID` - anything else is a 422 - so the fallback of an old tablet / an insecure context
// (no `crypto.randomUUID`) must be a UUID too, not a «hex-rand-rand» string (WAVE E, decision 5; LESSONS 85: the key lives from the opening of the dialog).

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type CryptoLike = { randomUUID?: () => string; getRandomValues?: (bytes: Uint8Array) => Uint8Array };

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  try {
    const c = (globalThis as { crypto?: CryptoLike }).crypto;
    if (c && typeof c.getRandomValues === "function") {
      c.getRandomValues(bytes);
      return bytes;
    }
  } catch {
    // fall through to Math.random
  }
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** A UUID v4: `crypto.randomUUID` when it exists (and returns the right shape), otherwise built by hand from the random bytes. */
export function newIdempotencyKey(): string {
  try {
    const c = (globalThis as { crypto?: CryptoLike }).crypto;
    if (c && typeof c.randomUUID === "function") {
      const key = c.randomUUID();
      if (UUID_V4.test(key)) return key;
    }
  } catch {
    // fall through to the hand-made key
  }
  const bytes = randomBytes();
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
