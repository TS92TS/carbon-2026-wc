/* =========================================================================
   COMPONENT · ZONES PAGE
   When the user lands on zones.html via a fixture-row deep-link, this module:
     1. Mounts a "you're booking for X match" banner above the zone list.
     2. Enhances every <a href^="book.html"> on the page so the fixture
        params are carried forward to the booking form.
   When the user lands on zones.html with no fixture context, it attempts to
   recover the last viewed match from session memory. If empty, it bails cleanly.
   ========================================================================= */

import { safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getDetailedStageLabel,
} from "../lib/matchData.js";

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

  // Swapped to re-assignable variables to allow clean memory-injection without loop mutation bloat
  let params = new URLSearchParams(window.location.search);
  let fixture = params.get("fixture");

  // === LAYER 1: MEMORIZE CONTEXT ===
  if (fixture) {
    try {
      // Persist ONLY the allow-listed carry keys so a malicious or stale
      // querystring (`?fixture=…&utm_evil=…`) cannot ride the next session
      // restoration back into the address bar.
      const sanitized = new URLSearchParams();
      CARRY_KEYS.forEach((k) => {
        const v = params.get(k);
        if (v) sanitized.set(k, v);
      });
      sessionStorage.setItem("carbon_last_zones_context", sanitized.toString());
    } catch (storageErr) {
      console.warn(
        "Zones Context: Failed to write session persistence",
        storageErr,
      );
    }
  }
  // === LAYER 2: RECOVER CONTEXT ===
  else {
    try {
      const savedContextStr = sessionStorage.getItem(
        "carbon_last_zones_context",
      );
      if (savedContextStr) {
        const recoveredRaw = new URLSearchParams(savedContextStr);

        if (recoveredRaw.has("fixture")) {
          // Re-sanitise on read too — defends against any pre-existing
          // session payload written by an older build before the
          // write-side allow-list landed.
          const recoveredParams = new URLSearchParams();
          CARRY_KEYS.forEach((k) => {
            const v = recoveredRaw.get(k);
            if (v) recoveredParams.set(k, v);
          });

          window.history.replaceState(
            null,
            "",
            `${window.location.pathname}?${recoveredParams.toString()}`,
          );

          params = recoveredParams;
          fixture = params.get("fixture");
          console.info(
            "Zones Context: Successfully recovered last viewed match from session memory",
          );
        }
      }
    } catch (recoveryErr) {
      console.warn(
        "Zones Context: Safe degradation during state lookup",
        recoveryErr,
      );
    }
  }

  // Absolute safe guard: if both URL parsing and cache extraction turn up empty,
  // exit execution immediately. The page remains safely in generic informational mode.
  if (!fixture) return;

  // 1. Banner content
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
  if (flagAEl)
    flagAEl.style.backgroundImage = safeBackgroundUrl(params.get("flagA"));
  if (flagBEl)
    flagBEl.style.backgroundImage = safeBackgroundUrl(params.get("flagB"));

  banner.removeAttribute("hidden");

  // 1b. Reveal the directional cue ("Now Pick Your Zone") that makes the
  // next funnel step explicit. Independent of the banner so the cue can be
  // safely omitted from any future page that doesn't need it.
  const cue = document.getElementById("zone-cue");
  if (cue) cue.removeAttribute("hidden");

  // 2. Funnel shortcut — when the user arrives with fixture context (Path A
  //     Step 2), the zone-card CTAs should jump STRAIGHT to book.html with
  //     the full carry, bypassing the Path B middle step (which exists only
  //     for zone-first entries that still need to pick a fixture). The
  //     static zone-card hrefs are `fixtures.html?zone=X` by default; we
  //     rewrite the page prefix to `book.html` and merge in the carried
  //     fixture/date/time/flag context here.
  //
  //     Selector is intentionally narrow (`?zone=` query, not bare
  //     `fixtures.html`) so the nav + mobile-menu Reserve links — which
  //     point at bare `fixtures.html` to start a fresh funnel — are left
  //     alone.
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
