/**
 * Latest-request-wins guard for async loads (student profile, exam history).
 *
 * Every request calls `next()` when it starts and keeps the returned token; when
 * its response arrives it applies data / error / loading state only if
 * `isCurrent(token)` — i.e. no newer request has started since.  Unlike
 * comparing a "current id" ref, this also handles A -> B -> A switches and a
 * reload of the same entity while an older request is still in flight.
 */
export interface RequestSequence {
  /** Start a request: invalidates every earlier token and returns the new one. */
  next(): number;
  /** True while `token` belongs to the most recently started request. */
  isCurrent(token: number): boolean;
}

export function createRequestSequence(): RequestSequence {
  let latest = 0;
  return {
    next: () => ++latest,
    isCurrent: (token: number) => token === latest,
  };
}

/**
 * A request for `requestedFor` may start only while that entity is still the one
 * on screen.  Callbacks captured by an older render (a save that resolves after
 * the user navigated to another student, then reloads "its" profile) fail this
 * check, so they can never become the latest request for the wrong student.
 */
export function canStartRequest(requestedFor: string | null | undefined, onScreen: string | null | undefined): boolean {
  return !!requestedFor && requestedFor === onScreen;
}
