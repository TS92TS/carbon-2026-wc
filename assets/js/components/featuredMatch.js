import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getDetailedStageLabel,
  isAnonymousMatch,
  isFullyBookedFixture,
} from "../lib/matchData.js";
import { TROPHY_SVG_MARKUP } from "../lib/constants.js";

/**
 * Renders the home hero match card. England fixtures take priority;
 * falls back to the next upcoming match. Anonymous (TBD) variants swap
 * to a trophy + stage label so the card never frames empty flag boxes.
 */
export function renderFeaturedMatch(matchPayload) {
  const card = document.getElementById("featured-match");
  if (!card || !matchPayload) return;

  const safe = (v) => (v === undefined || v === null ? "" : v);

  card.setAttribute("aria-busy", "true");

  // England priority, falling through to the next upcoming match.
  const featured =
    matchPayload.england && matchPayload.england.length > 0
      ? matchPayload.england[0]
      : matchPayload.upcoming && matchPayload.upcoming.length > 0
        ? matchPayload.upcoming[0]
        : null;

  if (matchPayload.status === "concluded" || !featured) {
    card.innerHTML =
      '<div class="c-match-card__header">Tournament Concluded</div>';
    card.setAttribute("aria-busy", "false");
    return;
  }

  const fmt = formatMatchDateTime(featured.datetimeIso);
  const dateFormatted = fmt ? fmt.dateShort : "";
  const timeFormatted = fmt ? fmt.time : "";

  const els = {
    badge: card.querySelector('[data-match-target="badge"]'),
    time: card.querySelector('[data-match-target="time"]'),
    nameA: card.querySelector('[data-match-target="name-a"]'),
    flagA: card.querySelector('[data-match-target="flag-a"]'),
    nameB: card.querySelector('[data-match-target="name-b"]'),
    flagB: card.querySelector('[data-match-target="flag-b"]'),
    bookingBtn: card.querySelector('[data-match-target="booking-link"]'),
  };

  if (els.badge) els.badge.textContent = getDetailedStageLabel(featured);

  if (els.time) {
    els.time.textContent = `${dateFormatted}${dateFormatted && timeFormatted ? " · " : ""}${timeFormatted}`;
    if (safe(featured.datetimeIso))
      els.time.setAttribute("datetime", safe(featured.datetimeIso));
  }

  // Anonymous TBD: replace flags+names with a trophy + status line. The
  // header badge still carries the stage so the card body stays lean.
  const isAnonymous = isAnonymousMatch(featured);
  const teamsContainer = card.querySelector(".c-match-card__teams");

  if (isAnonymous) {
    card.classList.add("c-match-card--milestone");
    if (teamsContainer) {
      teamsContainer.innerHTML = "";

      const emblem = document.createElement("div");
      emblem.className = "c-match-card__milestone-emblem";
      emblem.innerHTML = TROPHY_SVG_MARKUP;
      teamsContainer.appendChild(emblem);

      const note = document.createElement("p");
      note.className = "c-match-card__milestone-note";
      note.textContent = "Teams to be confirmed";
      teamsContainer.appendChild(note);
    }
  } else {
    card.classList.remove("c-match-card--milestone");
    const nameA = safe(featured.teamA?.name).trim();
    const nameB = safe(featured.teamB?.name).trim();

    if (els.nameA) els.nameA.textContent = nameA || "TBD";
    if (els.flagA) {
      els.flagA.style.backgroundImage = safeBackgroundUrl(featured.teamA?.flag);
    }
    if (els.nameB) els.nameB.textContent = nameB || "TBD";
    if (els.flagB) {
      els.flagB.style.backgroundImage = safeBackgroundUrl(featured.teamB?.flag);
    }
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
      // Non-bookable — route the dead "book" tap to the venue phone so
      // the click still has a clear next step. Muted styling
      // distinguishes it from the live CTA. Text differs by reason:
      //   • Fully booked → state + reassurance ("walk-ins welcome")
      //   • 3-hour cut-off → walk-ins action, phone number visible
      // Tapping the button dials the venue in both cases.
      els.bookingBtn.href = "tel:+441449674674";
      els.bookingBtn.removeAttribute("aria-disabled");
      els.bookingBtn.classList.remove("c-button--pulse");
      els.bookingBtn.classList.add("c-button--muted");
      els.bookingBtn.textContent = isFullyBookedFixture(featured)
        ? "Fully Booked · Walk-ins Welcome"
        : "Walk-ins Only · Call 01449 674674";
    }
  }

  card.setAttribute("aria-busy", "false");
}
