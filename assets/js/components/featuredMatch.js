import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getDetailedStageLabel,
  isAnonymousMatch,
} from "../lib/matchData.js";
import { TROPHY_SVG_MARKUP } from "../lib/constants.js";

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

  // 1. Swap general category string for high-fidelity round names
  if (els.badge) els.badge.textContent = getDetailedStageLabel(featured);

  if (els.time) {
    els.time.textContent = `${dateFormatted}${dateFormatted && timeFormatted ? " · " : ""}${timeFormatted}`;
    if (safe(featured.datetimeIso))
      els.time.setAttribute("datetime", safe(featured.datetimeIso));
  }

  // 2. Anonymous (TBD) featured fixture — the card body becomes a single
  //    centred trophy emblem + "Teams to be confirmed" status rather than
  //    two empty flag boxes around redundant TBD VS TBD text. The badge
  //    in the header still carries the stage label ("WORLD CUP FINAL"),
  //    so the milestone body stays lean: visual anchor + status. The
  //    booking button below still wires up to the funnel (TBD matches
  //    are bookable when kickoff is outside the 3-hour cut-off).
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
      // Inside the 3-hour cut-off — online booking is closed, but rather
      // than burning the click impression on a dead-end label, route the
      // button to the venue phone so the user has a clear next step.
      // Muted styling differentiates it visually from the live "Book a
      // Table" CTA; the tel: scheme triggers the dialler on mobile and
      // is harmless on desktop (browser shows a "Call?" affordance).
      els.bookingBtn.href = "tel:+441449674674";
      els.bookingBtn.removeAttribute("aria-disabled");
      els.bookingBtn.classList.remove("c-button--pulse");
      els.bookingBtn.classList.add("c-button--muted");
      els.bookingBtn.textContent = "Walk-ins · Call 01449 674674";
    }
  }

  card.setAttribute("aria-busy", "false");
}
