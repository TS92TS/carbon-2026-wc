/* =========================================================================
   SHARED CONSTANTS · single source of truth for slugs, labels & SVG fragments
   ========================================================================= */

const IMG = new URL("../../img/", import.meta.url).href;

/* ZONE_DATA · slug → operational name + booking-summary thumbnail +
   guest range. Names flow through the booking summary, confirmation
   email, and AppSheet ledger (terse forms for staff); the site showcase
   shows fuller viewer-facing labels in the HTML (only the terrace
   differs — "Terrace" here vs "The Mill Terrace" on zones.html).

   Guest limits gate the booking stepper. Booths seat 10 and are gated to
   groups (6-guest minimum) so a 10-seat booth isn't allocated to a pair;
   bar + terrace take 1–20. Tune here and the stepper + range note follow. */
export const ZONE_DATA = {
  carbon: { name: "Carbon", img: `${IMG}carbon-thumb.webp`, minGuests: 2, maxGuests: 20 },
  terrace: { name: "Terrace", img: `${IMG}terrace-thumb.webp`, minGuests: 2, maxGuests: 20 },
  booth: { name: "Booth", img: `${IMG}booth-thumb.webp`, minGuests: 6, maxGuests: 10 },
};

/* O(1) zone-slug whitelist, derived from ZONE_DATA so the two cannot
   drift apart. */
export const VALID_ZONES = new Set(Object.keys(ZONE_DATA));

/* Filter chip keys recognised by the home teaser and the fixtures page. */
export const VALID_FILTERS = new Set([
  "all",
  "england",
  "knockout",
  "weekend",
]);

/* Inline trophy emblem for the milestone (TBD) row/card/banner/summary
   variants. Inline so it inherits `currentColor` from the parent. */
export const TROPHY_SVG_MARKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;
