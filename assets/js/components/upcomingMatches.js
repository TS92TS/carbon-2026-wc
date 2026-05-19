import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getLondonWeekday,
  isKnockoutMatch,
  getDetailedStageLabel,
  tlaOf,
  isAnonymousMatch,
} from "../lib/matchData.js";

/* Trophy emblem for the milestone (TBD) row variant — inline SVG so it
   inherits `currentColor`. Mirrors the markup used in fixturesPage.js
   so both list contexts render identical TBD rows. */
const TROPHY_SVG_MARKUP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>`;

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
  // Carries the active chip filter onto explicit "view more" affordances
  // only — `.c-link-action` is the semantic carrier for those (see the
  // "All Fixtures" link beneath the home-page chip strip). The bottom nav,
  // mobile menu, Reserve CTA, hero CTA, featured-match button and promo
  // tiles all point at `fixtures.html` too, but they're fresh-funnel
  // entries — they intentionally start a clean booking flow rather than
  // inherit a filter the user picked while browsing the home feed.
  document
    .querySelectorAll(
      'a.c-link-action[href^="fixtures.html"], a.c-link-action[href*="/fixtures.html"]',
    )
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
    const isAnonymous = isAnonymousMatch(match);

    row.className = [
      "c-fixture-row",
      isBookable ? "" : "c-fixture-row--locked",
      isAnonymous ? "c-fixture-row--milestone" : "",
    ]
      .filter(Boolean)
      .join(" ");

    // ---- Leading content: teams OR milestone block ----
    let leadingDiv;
    if (isAnonymous) {
      // TBD knockout fixture — trophy emblem + stage label as headline,
      // "Teams TBC" as transparent status. No empty flag boxes.
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

      // Build a team cell with both full name AND TLA in the DOM. CSS
      // toggles which is visible by viewport (TLA below 600px, full name
      // above) so list rows stay readable on phones without ellipsizing
      // long names mid-word.
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

    // Stage label rides in the meta line for confirmed matches (the
    // user often needs the stage as context against the team names).
    // For milestone (anonymous) rows the stage is already the headline,
    // so we keep the meta lean — date · time only.
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
