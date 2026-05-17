import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getLondonWeekday,
  isKnockoutMatch,
  getDetailedStageLabel,
} from "../lib/matchData.js";

let matchCache = null;
const DISPLAY_LIMIT = 4;

// Mirrors fixturesPage.js — must stay in lockstep with the filter chips
// rendered in fixtures.html and index.html. Any new filter key needs to be
// added here AND in fixturesPage.js until we lift this to a shared module.
const VALID_FILTERS = new Set(["all", "england", "knockout", "weekend"]);

/**
 * Render the upcoming fixtures feed.
 * Automatically hooks URL state data to preserve filter intent across page jumps.
 */
export function renderUpcomingList(data) {
  const filterNav = document.getElementById("fixture-filters");

  // DEFENSIVE FALLBACK: Check common container IDs to support multi-page deployments safely
  const container =
    document.getElementById("upcoming-fixtures-list") ||
    document.getElementById("fixtures-list") ||
    document.getElementById("all-fixtures-container");

  if (!data) return;
  matchCache = data;

  // === INTENT STATE RESOLUTION CASCADE ===
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get("filter");
  const htmlDefault = filterNav ? filterNav.dataset.defaultFilter : null;
  let activeFilter = urlFilter || htmlDefault || "england";
  // Hostile or stale ?filter=… values are rejected so the chip-active
  // state, the URL, and the rendered list never desync.
  if (!VALID_FILTERS.has(activeFilter)) {
    activeFilter = "england";
  }

  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container);
    filterNav.dataset.initialized = "true";
  }

  // Synchronize visual state of the chips and map outbound link query targets
  if (filterNav) {
    syncChipStates(filterNav, activeFilter);
  }

  // Render list elements only if a matching display grid exists on the active DOM
  if (container) {
    const initialList = getFilteredList(activeFilter);
    updateUI(initialList, container);
  }
}

/**
 * Pure data mapping selector to avoid code duplication between load and click states
 */
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
      return england;
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

/**
 * Synchronizes the utility classes and intercepts cross-page anchor configurations
 */
function syncChipStates(nav, activeFilter) {
  nav.querySelectorAll("[data-filter]").forEach((chip) => {
    const isActive = chip.dataset.filter === activeFilter;
    chip.classList.toggle("c-chip--active", isActive);
    chip.setAttribute("aria-pressed", isActive ? "true" : "false");
  });

  // === OUTBOUND INTENT BRIDGE ===
  // Automatically serializes the active state onto all navigation anchors pointing to the schedule
  document
    .querySelectorAll('a[href^="fixtures.html"], a[href*="/fixtures.html"]')
    .forEach((link) => {
      try {
        const url = new URL(link.getAttribute("href"), window.location.origin);
        url.searchParams.set("filter", activeFilter);
        // Keeps path signatures relative to the file root execution shell
        link.setAttribute("href", url.pathname.split("/").pop() + url.search);
      } catch (e) {
        // Passive safety catch for structural variations
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

    // === STATEFUL URL SYNCHRONIZATION ===
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("filter", filter);
      window.history.replaceState(null, "", url.toString());
    } catch (historyErr) {
      console.warn(
        "upcomingMatches: Failed to replaceState URL parameters",
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
    row.className = `c-fixture-row${isBookable ? "" : " c-fixture-row--locked"}`;

    const nameA = safe(match.teamA?.name).trim();
    const nameB = safe(match.teamB?.name).trim();
    const isAnonymous = nameA === "" && nameB === "";

    const teamsDiv = document.createElement("div");
    teamsDiv.className = "c-fixture-row__teams";

    // Team A
    const teamA = document.createElement("span");
    teamA.className = "c-fixture-row__team";
    const flagA = document.createElement("span");
    flagA.className = "c-fixture-row__flag";
    flagA.style.backgroundImage = safeBackgroundUrl(match.teamA?.flag);
    teamA.appendChild(flagA);
    teamA.appendChild(document.createTextNode(isAnonymous ? "TBD" : nameA));

    const vs = document.createElement("span");
    vs.className = "c-fixture-row__vs";
    vs.textContent = "VS";

    // Team B
    const teamB = document.createElement("span");
    teamB.className = "c-fixture-row__team";
    const flagB = document.createElement("span");
    flagB.className = "c-fixture-row__flag";
    flagB.style.backgroundImage = safeBackgroundUrl(match.teamB?.flag);
    teamB.appendChild(flagB);
    teamB.appendChild(document.createTextNode(isAnonymous ? "TBD" : nameB));

    teamsDiv.appendChild(teamA);
    teamsDiv.appendChild(vs);
    teamsDiv.appendChild(teamB);

    const metaDiv = document.createElement("div");
    metaDiv.className = "c-fixture-row__meta";
    const timeEl = document.createElement("time");

    const stageLabel = getDetailedStageLabel(match);
    timeEl.textContent = `${dateStr} · ${timeStr} · ${stageLabel}`;
    metaDiv.appendChild(timeEl);

    row.appendChild(teamsDiv);
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
      lockBadge.textContent = "Walk-ins Only";
      row.appendChild(lockBadge);
    }

    const li = document.createElement("li");
    li.appendChild(row);
    fragment.appendChild(li);
  });

  container.appendChild(fragment);
  container.setAttribute("aria-busy", "false");
}
