/* =========================================================================
   COMPONENT · ZONES PAGE
   When the user lands on zones.html via a fixture-row deep-link, this module:
     1. Mounts a "you're booking for X match" banner above the zone list.
     2. Enhances every <a href^="book.html"> on the page so the fixture
        params are carried forward to the booking form.
   When the user lands on zones.html with no fixture context, the function is
   a no-op — the page works exactly as it always has.
   ========================================================================= */

import { safeBackgroundUrl } from "../lib/urlHelpers.js";
import { formatMatchDateTime } from "../lib/matchData.js";

const CARRY_KEYS = ["fixture", "date", "time", "flagA", "flagB"];

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
  if (!fixture) return; // No fixture context — banner stays hidden, hrefs untouched.

  // 1. Banner content
  const slugEl = document.getElementById("banner-slug");
  const metaEl = document.getElementById("banner-meta");
  const flagAEl = document.getElementById("banner-flag-a");
  const flagBEl = document.getElementById("banner-flag-b");

  if (slugEl) slugEl.textContent = fixture.replace(/-/g, " ").toUpperCase();
  if (metaEl) {
    const parts = [formatBannerDate(params.get("date")), params.get("time")]
      .filter(Boolean);
    metaEl.textContent = parts.join(" · ");
  }
  if (flagAEl) flagAEl.style.backgroundImage = safeBackgroundUrl(params.get("flagA"));
  if (flagBEl) flagBEl.style.backgroundImage = safeBackgroundUrl(params.get("flagB"));

  banner.removeAttribute("hidden");

  // 1b. Reveal the directional cue ("Now Pick Your Zone") that makes the
  // next funnel step explicit. Independent of the banner so the cue can be
  // safely omitted from any future page that doesn't need it.
  const cue = document.getElementById("zone-cue");
  if (cue) cue.removeAttribute("hidden");

  // 2. Propagate fixture context to every book.html link on the page.
  //    Existing query params on each link (e.g. ?zone=carbon) are preserved.
  const carry = new URLSearchParams();
  CARRY_KEYS.forEach((k) => {
    const v = params.get(k);
    if (v) carry.set(k, v);
  });

  document.querySelectorAll('a[href^="book.html"]').forEach((a) => {
    const href = a.getAttribute("href") || "book.html";
    const queryStart = href.indexOf("?");
    const existing = new URLSearchParams(
      queryStart >= 0 ? href.slice(queryStart + 1) : "",
    );
    carry.forEach((v, k) => existing.set(k, v));
    a.setAttribute("href", `book.html?${existing.toString()}`);
  });
}
