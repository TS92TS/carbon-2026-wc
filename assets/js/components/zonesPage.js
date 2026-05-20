/* =========================================================================
   ZONES PAGE · Path A Step 2. When the user arrives with fixture context
   (?fixture=…&date=…&time=…&flagA=…&flagB=…) this module:
     1. mounts the "booking for X" banner above the zone list,
     2. reveals the step-2 cue,
     3. rewrites zone-card CTAs straight to book.html (skip the Path B step).
   URL is the single source of truth — no ?fixture= means generic browsing
   mode (no banner/cue; cards keep their fixtures.html?zone=X hrefs). No
   sessionStorage recovery, so direct visits never show stale step cues.
   ========================================================================= */

import { safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getDetailedStageLabel,
} from "../lib/matchData.js";
import { TROPHY_SVG_MARKUP } from "../lib/constants.js";

const CARRY_KEYS = ["fixture", "date", "time", "flagA", "flagB"];

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

  // No ?fixture= → generic browsing mode (cards keep their Path B hrefs).
  if (!fixture) return;

  // Banner content
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

  // TBD knockout — flag A hosts a trophy, flag B hides (two empty grey
  // boxes would read as a loading state). Slug-based detection since
  // zones.html doesn't load matchData.
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

  const cue = document.getElementById("zone-cue");
  if (cue) cue.removeAttribute("hidden");

  // Rewrite zone-card CTAs straight to book.html with the carry. The
  // `?zone=` selector is deliberately narrow so the nav / Reserve links
  // (bare fixtures.html, fresh-funnel entries) are left untouched.
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
