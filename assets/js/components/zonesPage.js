/* =========================================================================
   COMPONENT · ZONES PAGE
   When the user lands on zones.html via a Path A funnel step (clicking a
   fixture row → URL carries ?fixture=...&date=...&time=...&flagA=...&flagB=...),
   this module:
     1. Mounts a "you're booking for X match" banner above the zone list.
     2. Reveals the "Now Pick Your Zone" step-2 cue.
     3. Rewrites every zone-card CTA so it jumps straight to book.html
        with the full carry, skipping the Path B middle step.

   The URL is the SINGLE SOURCE OF TRUTH for funnel context. If the user
   arrives at zones.html without ?fixture= (via the Reserve nav, the
   "Browse the Space" CTA, a direct URL, or a bookmark), the page renders
   in its generic browsing mode with no banner, no cue, and zone-card CTAs
   pointing at the Path B step-2 entry (fixtures.html?zone=X). This is
   intentional: prior auto-recovery from sessionStorage surfaced stale
   step indicators on direct visits, creating confusion. The browser's
   own URL persistence (back/forward, bookmarks) covers the "continue
   your booking" use case without falsely flagging arbitrary visits as
   in-funnel.
   ========================================================================= */

import { safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getDetailedStageLabel,
} from "../lib/matchData.js";

const CARRY_KEYS = ["fixture", "date", "time", "flagA", "flagB"];

/* Trophy emblem for the milestone (TBD) banner variant — same inline
   SVG used on fixture rows, the featured card, and the booking summary
   so the trophy reads as one visual identity across every TBD surface
   in the funnel. */
const TROPHY_SVG_MARKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;

/**
 * Resolve the banner headline. For half-anonymous slugs (e.g.
 * "england-vs-tbd") the slug itself is informative enough — uppercase it
 * and we're done. For fully anonymous knockout deep-links ("tbd-vs-tbd")
 * we fall back to the tournament milestone label so the user sees
 * "QUARTER-FINAL" / "WORLD CUP FINAL" instead of a confusing "TBD VS TBD".
 */
function resolveBannerHeadline(fixture, dateParam, timeParam) {
  const upper = fixture.replace(/-/g, " ").toUpperCase();
  if (upper !== "TBD VS TBD") return upper;

  // Synthesise a pseudo-match so getDetailedStageLabel's date-window
  // classifier can resolve the round. Europe/London offset is +01:00
  // across the whole tournament window (June–July 2026, all in BST).
  if (dateParam && timeParam) {
    const pseudoMatch = {
      badge: "Knockout",
      datetimeIso: `${dateParam}T${timeParam}:00+01:00`,
    };
    const stageLabel = getDetailedStageLabel(pseudoMatch);
    if (stageLabel) return stageLabel;
  }
  return "KNOCKOUT MATCH";
}

// The `date` URL param is already a Europe/London YYYY-MM-DD (emitted by
// urlHelpers.buildMatchURL). Anchor it to noon UTC so the formatter's
// London-tz conversion can never roll across a day boundary.
function formatBannerDate(iso) {
  if (!iso) return "";
  const fmt = formatMatchDateTime(`${iso}T12:00:00Z`);
  return fmt ? fmt.dateShort : iso;
}

export function initZonesPage() {
  const banner = document.querySelector('[data-component="fixture-banner"]');
  if (!banner) return;

  const params = new URLSearchParams(window.location.search);
  const fixture = params.get("fixture");

  // URL-as-single-source-of-truth: no ?fixture= means generic browsing
  // mode. Return cleanly — no banner, no cue, no zone-card rewrite. The
  // page renders as a browseable showcase of the three zones, with zone
  // cards retaining their static "fixtures.html?zone=X" hrefs (Path B
  // entry point).
  if (!fixture) return;

  // ---- Banner content ---------------------------------------------------
  const slugEl = document.getElementById("banner-slug");
  const metaEl = document.getElementById("banner-meta");
  const flagAEl = document.getElementById("banner-flag-a");
  const flagBEl = document.getElementById("banner-flag-b");

  if (slugEl) {
    slugEl.textContent = resolveBannerHeadline(
      fixture,
      params.get("date"),
      params.get("time"),
    );
  }
  if (metaEl) {
    const parts = [
      formatBannerDate(params.get("date")),
      params.get("time"),
    ].filter(Boolean);
    metaEl.textContent = parts.join(" · ");
  }

  // TBD knockout fixture — promote flag A to a trophy emblem host and
  // hide flag B. The two empty grey rectangles around "WORLD CUP FINAL"
  // would otherwise read as a loading state. Detection is slug-based
  // (URL only — zones.html doesn't load matchData) so this is a single
  // string comparison, no extra fetches. Confirmed-team fixtures take
  // the standard flag-background path.
  const isAnonymousSlug = fixture.toLowerCase() === "tbd-vs-tbd";

  if (isAnonymousSlug) {
    banner.classList.add("c-fixture-banner--milestone");
    if (flagAEl) {
      flagAEl.style.backgroundImage = "";
      flagAEl.classList.add("c-fixture-banner__flag-trophy");
      flagAEl.innerHTML = TROPHY_SVG_MARKUP;
    }
    if (flagBEl) flagBEl.style.display = "none";
  } else {
    if (flagAEl)
      flagAEl.style.backgroundImage = safeBackgroundUrl(params.get("flagA"));
    if (flagBEl)
      flagBEl.style.backgroundImage = safeBackgroundUrl(params.get("flagB"));
  }

  banner.removeAttribute("hidden");

  // Reveal the directional cue ("Step 2 of 3 · Now Pick Your Zone").
  // Independent of the banner so the cue can be safely omitted from any
  // future page that doesn't need it.
  const cue = document.getElementById("zone-cue");
  if (cue) cue.removeAttribute("hidden");

  // ---- Funnel shortcut: rewrite zone-card CTAs --------------------------
  // When the user arrives with fixture context (Path A Step 2), zone-card
  // CTAs should jump STRAIGHT to book.html with the full carry, bypassing
  // the Path B middle step (which exists only for zone-first entries
  // still needing to pick a fixture). The static zone-card hrefs are
  // `fixtures.html?zone=X` by default; we rewrite the page prefix to
  // `book.html` and merge in the carried fixture/date/time/flag context.
  //
  // Selector is intentionally narrow (`?zone=` query, not bare
  // `fixtures.html`) so the nav + mobile-menu Reserve links — which
  // point at bare `fixtures.html` to start a fresh funnel — are left
  // alone.
  const carry = new URLSearchParams();
  CARRY_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) carry.set(k, v);
  });

  document.querySelectorAll('a[href^="fixtures.html?zone="]').forEach((a) => {
    const href = a.getAttribute("href") || "";
    const queryStart = href.indexOf("?");
    const existing = new URLSearchParams(
      queryStart >= 0 ? href.slice(queryStart + 1) : "",
    );
    carry.forEach((v, k) => existing.set(k, v));
    a.setAttribute("href", `book.html?${existing.toString()}`);
  });
}
