/**
 * Path segment of an id for an API URL. Router params may arrive already
 * percent-encoded ("a%2Fb"): decode once, then encode, so the id is never
 * double-encoded ("a%252Fb"). An id that is not valid percent-encoding
 * (a literal "100%") is encoded as it is.
 */
export function encodePathId(id: string): string {
  let raw = id;
  try {
    raw = decodeURIComponent(id);
  } catch {
    raw = id;
  }
  return encodeURIComponent(raw);
}
