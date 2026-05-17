import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import { formatMatchDateTime } from "../lib/matchData.js";

/**
 * Renders the primary Hero match card with England priority.
 * @param {Object} matchPayload - The full data object containing .upcoming and .england arrays.
 */
export function renderFeaturedMatch(matchPayload) {
  const card = document.getElementById("featured-match");
  if (!card || !matchPayload) return;

  const safe = (v) => (v === undefined || v === null ? "" : v);

  // Signal loading state for assistive tech
  card.setAttribute("aria-busy", "true");

  // 1. THE SELECTION LOGIC (England Priority)
  const featured =
    matchPayload.england && matchPayload.england.length > 0
      ? matchPayload.england[0]
      : matchPayload.upcoming && matchPayload.upcoming.length > 0
        ? matchPayload.upcoming[0]
        : null;

  // 2. SAFETY CHECK: If the tournament is over or no data exists
  if (matchPayload.status === "concluded" || !featured) {
    card.innerHTML =
      '<div class="c-match-card__header">Tournament Concluded</div>';
    card.setAttribute("aria-busy", "false");
    return;
  }

  // 3. DATA PREPARATION — Europe/London via shared formatter
  const fmt = formatMatchDateTime(featured.datetimeIso);
  const dateFormatted = fmt ? fmt.dateShort : "";
  const timeFormatted = fmt ? fmt.time : "";

  // 4. DOM INJECTION (Scoped Lookups)
  const els = {
    badge: card.querySelector('[data-match-target="badge"]'),
    time: card.querySelector('[data-match-target="time"]'),
    nameA: card.querySelector('[data-match-target="name-a"]'),
    flagA: card.querySelector('[data-match-target="flag-a"]'),
    nameB: card.querySelector('[data-match-target="name-b"]'),
    flagB: card.querySelector('[data-match-target="flag-b"]'),
    bookingBtn: card.querySelector('[data-match-target="booking-link"]'),
  };

  if (els.badge) els.badge.textContent = safe(featured.badge);

  if (els.time) {
    els.time.textContent = `${dateFormatted}${dateFormatted && timeFormatted ? " · " : ""}${timeFormatted}`;
    if (safe(featured.datetimeIso))
      els.time.setAttribute("datetime", safe(featured.datetimeIso));
  }

  if (els.nameA) els.nameA.textContent = safe(featured.teamA?.name);
  if (els.flagA) {
    els.flagA.style.backgroundImage = safeBackgroundUrl(featured.teamA?.flag);
  }

  if (els.nameB) els.nameB.textContent = safe(featured.teamB?.name);
  if (els.flagB) {
    els.flagB.style.backgroundImage = safeBackgroundUrl(featured.teamB?.flag);
  }

  // 5. UX ENHANCEMENT: Contextual Button Logic
  if (els.bookingBtn) {
    const status = safe(featured.badge).toLowerCase();
    const isBookable = featured.isBookable === true;

    if (isBookable) {
      try {
        els.bookingBtn.href = buildZonesURL(featured);
      } catch (urlErr) {
        console.warn("featuredMatch: buildZonesURL failed", urlErr);
        els.bookingBtn.href = "zones.html";
      }
      els.bookingBtn.removeAttribute("aria-disabled");
      els.bookingBtn.classList.remove("c-button--muted");

      if (status === "live") {
        els.bookingBtn.textContent = "Join the Atmosphere";
        els.bookingBtn.classList.add("c-button--pulse");
      } else {
        els.bookingBtn.textContent = "Book a Table";
        els.bookingBtn.classList.remove("c-button--pulse");
      }
    } else {
      // Inside the 3-hour cut-off — remove navigation, downgrade to a
      // walk-ins notice. removeAttribute("href") strips link semantics
      // entirely so screen readers + keyboard nav both treat it as a
      // non-interactive label.
      els.bookingBtn.removeAttribute("href");
      els.bookingBtn.setAttribute("aria-disabled", "true");
      els.bookingBtn.classList.remove("c-button--pulse");
      els.bookingBtn.classList.add("c-button--muted");
      els.bookingBtn.textContent = "Walk-ins Only";
    }
  }

  card.setAttribute("aria-busy", "false");
}
