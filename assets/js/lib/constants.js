/* =========================================================================
   SHARED CONSTANTS
   Single source of truth for slugs, display labels, and inline SVG
   fragments that previously had to be mirrored across components. Any
   drift between those mirrored copies caused subtle bugs (e.g. a filter
   chip key added in one place but not the other silently dropping users
   into a fallback). Lifting them here means one edit propagates to every
   consumer at the next page load.
   ========================================================================= */

/* `import.meta.url` resolves against the location of THIS module
   (assets/js/lib/constants.js). From here, the image directory sits two
   parents up at assets/img/ — same depth as the previous booking.js home
   for this constant, so consumers see byte-identical URLs after the
   move. */
const IMG = new URL("../../img/", import.meta.url).href;

/* ZONE_DATA — canonical mapping from URL slug to human-readable name and
   booking-summary thumbnail. Slugs are the routing primitive (carbon /
   terrace / booth); names are what customers see in confirmation emails
   and the booking summary; thumbnails are used by booking.js's
   zone-snapshot panel. Add a new zone here and every consumer picks it
   up automatically. */
export const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "The Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booths", img: `${IMG}booth-thumb.webp` },
};

/* Pre-computed Set for O(1) zone-slug whitelist checks. Constructed from
   ZONE_DATA keys so the two stay in lockstep automatically — no risk of
   the validator and the data going out of sync. */
export const VALID_ZONES = new Set(Object.keys(ZONE_DATA));

/* VALID_FILTERS — the chip keys recognised by both the home-page teaser
   and the fixtures-page schedule renderer. Hostile or stale `?filter=`
   values are rejected against this set so the chip state, the URL, and
   the rendered list can never desync. */
export const VALID_FILTERS = new Set([
  "all",
  "england",
  "knockout",
  "weekend",
]);

/* TROPHY_SVG_MARKUP — inline SVG used in the milestone (TBD) row, card,
   banner and summary variants across the funnel. Inline (not <img>) so
   it inherits `currentColor` from the parent and can be tinted per
   context via CSS. `aria-hidden="true"` because the adjacent text always
   carries the semantic load ("WORLD CUP FINAL · Teams TBC"). */
export const TROPHY_SVG_MARKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;
