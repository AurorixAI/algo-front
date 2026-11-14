/**
 * PublicBackground — the soft full-screen background of every public screen (login, invite, onboarding, /d/<code>, /e/<code>).
 * The spots are radial gradients, NOT blurred circles: Safari on iOS paints a big `filter: blur()` for 6-15 s and the page is frozen
 * meanwhile (lesson 14.11).  The look is in `.public-bg` of globals.css.
 */
export function PublicBackground() {
  return <div className="public-bg fixed inset-0 pointer-events-none z-0" aria-hidden />;
}
