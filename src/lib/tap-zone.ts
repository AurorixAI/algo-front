/**
 * Money-1 B, defect Д4 (UX pack rule 6): on a phone every tap target is at least 40 px high.  A control that must stay small to the eye gets an invisible zone (the `::after` of the control, centred, 40 px high) -
 * the same trick as `checkbox.tsx` / `radio.tsx`.  The zone grows only up and down, so neighbours in a row never share a tap; rows that wrap keep a 10 px gap (`TAP_ZONE_ROWS`).  `data-touch-zone` lets `touchTargets` read it.
 */
export const TAP_ZONE = "max-sm:relative max-sm:after:absolute max-sm:after:inset-x-0 max-sm:after:top-1/2 max-sm:after:h-10 max-sm:after:-translate-y-1/2 max-sm:after:content-['']";
/** The row gap between wrapped controls with a tap zone: 30 px + 10 px = 40 px, the zones do not overlap. */
export const TAP_ZONE_ROWS = "max-sm:gap-y-2.5";
