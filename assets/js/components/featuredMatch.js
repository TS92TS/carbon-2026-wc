import { buildBookingURL, safeBackgroundUrl } from "../lib/urlHelpers.js";

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

  // 3. DATA PREPARATION (Optimized formatting)
  const matchDate = new Date(safe(featured.datetimeIso));
  const dateFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
  const timeFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

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
    try {
      els.bookingBtn.href = buildBookingURL(featured);
    } catch (urlErr) {
      console.warn("featuredMatch: buildBookingURL failed", urlErr);
      els.bookingBtn.href = "#";
    }

    const status = safe(featured.badge).toLowerCase();
    if (status === "live") {
      els.bookingBtn.textContent = "Join the Atmosphere";
      els.bookingBtn.classList.add("c-button--pulse");
    } else {
      els.bookingBtn.textContent = "Book a Table";
    }
  }

  card.setAttribute("aria-busy", "false");
}
