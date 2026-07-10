import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getLondonWeekday,
  isKnockoutMatch,
  getDetailedStageLabel,
  getHeadlineMatches,
  tlaOf,
  isAnonymousMatch,
  isFullyBookedFixture,
} from "../lib/matchData.js";
import { TROPHY_SVG_MARKUP, VALID_FILTERS } from "../lib/constants.js";

let matchCache = null;
const DISPLAY_LIMIT = 4;

/**
 * "England's tournament is over" probe. When the data feed has no
 * England fixtures (eliminated or unscheduled), the chip's spatial role
 * stays put but the displayed dataset swaps to the next headline
 * knockouts and the chip label switches to "Headlines".
 */
function isEnglandFallbackActive() {
  if (!matchCache) return false;
  return (
    !Array.isArray(matchCache.england) || matchCache.england.length === 0
  );
}

/** Render the upcoming fixtures feed, preserving filter intent across pages. */
export function renderUpcomingList(data) {
  const filterNav = document.getElementById("fixture-filters");

  // Fall through several container IDs so the same renderer drives
  // both the home teaser and any future list-style surfaces.
  const container =
    document.getElementById("upcoming-fixtures-list") ||
    document.getElementById("fixtures-list") ||
    document.getElementById("all-fixtures-container");

  if (!data) return;
  matchCache = data;

  // Resolve active filter from URL > HTML default > "england".
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get("filter");
  const htmlDefault = filterNav ? filterNav.dataset.defaultFilter : null;
  let activeFilter = urlFilter || htmlDefault || "england";
  if (!VALID_FILTERS.has(activeFilter)) activeFilter = "england";

  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container);
    filterNav.dataset.initialized = "true";
  }

  if (filterNav) syncChipStates(filterNav, activeFilter);

  if (container) {
    updateUI(getFilteredList(activeFilter), container);
  }
}

function getFilteredList(filter) {
  if (!matchCache) return [];
  const upcoming = Array.isArray(matchCache.upcoming)
    ? matchCache.upcoming
    : [];
  const england = Array.isArray(matchCache.england) ? matchCache.england : [];

  switch (filter) {
    case "all":
      return upcoming;
    case "england":
      // When England is empty, the chip still serves "what's headline
      // at the venue" — swap to the next knockouts. syncChipStates
      // renames the chip label in parallel.
      return isEnglandFallbackActive()
        ? getHeadlineMatches(matchCache)
        : england;
    case "knockout":
      return upcoming.filter(isKnockoutMatch);
    case "weekend":
      return upcoming.filter((m) => {
        const w = getLondonWeekday(m?.datetimeIso);
        return w === "Saturday" || w === "Sunday";
      });
    default:
      return upcoming;
  }
}

/** Sync chip aria/active state, swap label on England-out, and carry the
 *  active filter onto explicit "view more" affordances. */
function syncChipStates(nav, activeFilter) {
  nav.querySelectorAll("[data-filter]").forEach((chip) => {
    const isActive = chip.dataset.filter === activeFilter;
    chip.classList.toggle("c-chip--active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // Filter KEY stays "england" so URL round-trips work unchanged; only
  // the visible label moves to "Headlines" when England's run is over.
  const englandChip = nav.querySelector('[data-filter="england"]');
  if (englandChip) {
    englandChip.textContent = isEnglandFallbackActive()
      ? "Headlines"
      : "England";
  }

  // Filter is carried ONLY onto `.c-link-action` (the "All Fixtures"
  // affordance). Nav, Reserve CTA, hero, featured button and promo
  // tiles all point at fixtures.html too but are fresh-funnel entries
  // and intentionally start clean.
  document
    .querySelectorAll(
      'a.c-link-action[href^="fixtures.html"], a.c-link-action[href*="/fixtures.html"]',
    )
    .forEach((link) => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.origin);
        url.searchParams.set("filter", activeFilter);
        link.setAttribute("href", url.pathname.split("/").pop() + url.search);
      } catch (e) {
        link.href = `fixtures.html?filter=${activeFilter}`;
      }
    });
}

function setupFilters(nav, container) {
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;

    const rawFilter = btn.dataset.filter;
    const filter = VALID_FILTERS.has(rawFilter) ? rawFilter : "england";

    try {
      const url = new URL(window.location.href);
      url.searchParams.set("filter", filter);
      window.history.replaceState(null, "", url.toString());
    } catch (historyErr) {
      console.warn(
        "upcomingMatches: replaceState failed",
        historyErr,
      );
    }

    syncChipStates(nav, filter);

    if (container) {
      const listToDisplay = getFilteredList(filter);
      updateUI(listToDisplay, container);
    }
  });
}

function updateUI(matches, container) {
  container.innerHTML = "";
  container.setAttribute("aria-busy", "true");
  const safe = (v) => (v === undefined || v === null ? "" : v);

  if (!matches || matches.length === 0) {
    const emptyLi = document.createElement("li");
    emptyLi.className = "u-dim u-tiny";
    emptyLi.style.padding = "var(--space-4)";
    emptyLi.textContent = "No matches found in this category.";
    container.appendChild(emptyLi);
    container.setAttribute("aria-busy", "false");
    return;
  }

  const limitedMatches = matches.slice(0, DISPLAY_LIMIT);
  const fragment = document.createDocumentFragment();

  limitedMatches.forEach((match) => {
    const fmt = formatMatchDateTime(match.datetimeIso);
    const dateStr = fmt ? fmt.dateShort : "";
    const timeStr = fmt ? fmt.time : "";

    const isBookable = match.isBookable === true;
    let row;
    if (isBookable) {
      let bookingUrl = "zones.html";
      try {
        bookingUrl = buildZonesURL(match);
      } catch (e) {
        console.warn("upcomingMatches: buildZonesURL failed", e);
      }
      row = document.createElement("a");
      row.href = bookingUrl;
    } else {
      row = document.createElement("div");
    }
    const isAnonymous = isAnonymousMatch(match);

    row.className = [
      "c-fixture-row",
      isBookable ? "" : "c-fixture-row--locked",
      isAnonymous ? "c-fixture-row--milestone" : "",
    ]
      .filter(Boolean)
      .join(" ");

    // Leading content: teams OR milestone block (TBD trophy + stage).
    let leadingDiv;
    if (isAnonymous) {
      leadingDiv = document.createElement("div");
      leadingDiv.className = "c-fixture-row__milestone";

      const emblem = document.createElement("span");
      emblem.className = "c-fixture-row__milestone-emblem";
      emblem.innerHTML = TROPHY_SVG_MARKUP;
      leadingDiv.appendChild(emblem);

      const textBlock = document.createElement("span");
      textBlock.className = "c-fixture-row__milestone-text";

      const stage = document.createElement("span");
      stage.className = "c-fixture-row__milestone-stage";
      stage.textContent = getDetailedStageLabel(match);
      textBlock.appendChild(stage);

      const note = document.createElement("span");
      note.className = "c-fixture-row__milestone-note";
      note.textContent = "Teams TBC";
      textBlock.appendChild(note);

      leadingDiv.appendChild(textBlock);
    } else {
      leadingDiv = document.createElement("div");
      leadingDiv.className = "c-fixture-row__teams";

      // Both full name and TLA ride in the DOM; CSS toggles which is
      // visible by viewport (TLA <600px, name ≥600px) so phone rows
      // never ellipsize mid-word.
      const buildTeam = (teamData, displayName) => {
        const team = document.createElement("span");
        team.className = "c-fixture-row__team";

        const flag = document.createElement("span");
        flag.className = "c-fixture-row__flag";
        flag.style.backgroundImage = safeBackgroundUrl(teamData?.flag);
        team.appendChild(flag);

        const nameSpan = document.createElement("span");
        nameSpan.className = "c-fixture-row__name";
        nameSpan.textContent = displayName;
        team.appendChild(nameSpan);

        const tlaSpan = document.createElement("span");
        tlaSpan.className = "c-fixture-row__tla";
        tlaSpan.textContent = tlaOf(teamData);
        team.appendChild(tlaSpan);

        return team;
      };

      const nameA = safe(match.teamA?.name).trim();
      const nameB = safe(match.teamB?.name).trim();
      const teamA = buildTeam(match.teamA, nameA || "TBD");

      const vs = document.createElement("span");
      vs.className = "c-fixture-row__vs";
      vs.textContent = "VS";

      const teamB = buildTeam(match.teamB, nameB || "TBD");

      leadingDiv.appendChild(teamA);
      leadingDiv.appendChild(vs);
      leadingDiv.appendChild(teamB);
    }

    const metaDiv = document.createElement("div");
    metaDiv.className = "c-fixture-row__meta";
    const timeEl = document.createElement("time");

    // Meta carries the stage for confirmed matches (added context next
    // to team names). Anonymous rows show the stage as the headline so
    // meta stays lean — date · time only.
    if (isAnonymous) {
      timeEl.textContent = `${dateStr} · ${timeStr}`;
    } else {
      const stageLabel = getDetailedStageLabel(match);
      timeEl.textContent = `${dateStr} · ${timeStr} · ${stageLabel}`;
    }
    metaDiv.appendChild(timeEl);

    row.appendChild(leadingDiv);
    row.appendChild(metaDiv);

    if (isBookable) {
      const arrowSvg = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      arrowSvg.setAttribute("class", "c-fixture-row__arrow");
      arrowSvg.setAttribute("viewBox", "0 0 24 24");
      arrowSvg.setAttribute("fill", "none");
      arrowSvg.setAttribute("stroke", "currentColor");
      arrowSvg.setAttribute("stroke-width", "2.5");
      arrowSvg.setAttribute("stroke-linecap", "round");
      arrowSvg.setAttribute("stroke-linejoin", "round");

      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path",
      );
      path.setAttribute("d", "M9 18l6-6-6-6");
      arrowSvg.appendChild(path);
      row.appendChild(arrowSvg);
    } else {
      const lockBadge = document.createElement("span");
      lockBadge.className = "c-badge c-badge--muted c-fixture-row__lock-badge";
      // "Fully Booked" when the fixture is at total venue capacity;
      // "Walk-ins Only" when the row is locked by the 3-hour cut-off.
      // Both states are non-bookable — the label just tells the customer
      // *why*.
      lockBadge.textContent = isFullyBookedFixture(match)
        ? "Fully Booked"
        : "Walk-ins Only";
      row.appendChild(lockBadge);
    }

    const li = document.createElement("li");
    li.appendChild(row);
    fragment.appendChild(li);
  });

  container.appendChild(fragment);
  container.setAttribute("aria-busy", "false");
}
