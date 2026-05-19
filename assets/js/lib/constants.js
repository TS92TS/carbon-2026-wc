/* =========================================================================
   SHARED CONSTANTS · single source of truth for slugs, labels & SVG fragments
   ========================================================================= */

const IMG = new URL("../../img/", import.meta.url).href;

/* ZONE_DATA · slug → display name + booking-summary thumbnail.
   Slugs are the routing primitive; names are what customers see in the
   booking summary and confirmation emails. */
export const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booth", img: `${IMG}booth-thumb.webp` },
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
