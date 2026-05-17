import { buildZonesURL, safeBackgroundUrl } from "../lib/urlHelpers.js";
import { formatMatchDateTime } from "../lib/matchData.js";

const safe = (v) => (v === undefined || v === null ? "" : v);

let matchCache = null;

/**
 * Initializes the full fixtures page rendering.
 * Called by app.js only when #fixtures-list is detected.
 * @param {Object} data - Match payload from matchData.js
 */
export function initFixturesPage(data) {
  const container = document.getElementById("fixtures-list");
  const englandContainer = document.getElementById("england-fixtures-list");
  const filterNav = document.getElementById("fixture-filters");
  if (!container || !data) return;

  matchCache = data;

  // Populate England HQ strip immediately
  if (englandContainer) {
    const engMatches = Array.isArray(matchCache.england)
      ? matchCache.england
      : [];
    if (engMatches.length > 0) {
      renderFixtures(engMatches, englandContainer, {
        skipDateHeaders: true,
        isEnglandStrip: true,
      });
    } else {
      englandContainer.innerHTML =
        '<li class="u-dim u-tiny" style="padding:var(--space-4)">No England fixtures scheduled.</li>';
      englandContainer.setAttribute("aria-busy", "false");
    }
  }

  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container);
    filterNav.dataset.initialized = "true";
  }

  const initialList = Array.isArray(matchCache.upcoming)
    ? matchCache.upcoming
    : [];
  renderFixtures(initialList, container);
}

/* ------------------------------------------------------------------ */
/* Filter wiring — now scoped to the full tournament list only        */
/* ------------------------------------------------------------------ */
function setupFilters(nav, container) {
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;

    nav.querySelectorAll(".c-chip").forEach((c) => {
      c.classList.remove("c-chip--active");
      c.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("c-chip--active");
    btn.setAttribute("aria-pressed", "true");

    const filter = btn.dataset.filter;
    let listToDisplay = [];

    if (filter === "all") {
      listToDisplay = matchCache.upcoming;
    } else if (filter === "knockout") {
      listToDisplay = (
        Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []
      ).filter((m) => m.badge && m.badge.toLowerCase().includes("knockout"));
    } else if (filter === "weekend") {
      listToDisplay = (
        Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []
      ).filter((m) => {
        const d = new Date(m.datetimeIso);
        if (isNaN(d.getTime())) return false;
        const day = d.getDay();
        return day === 0 || day === 6;
      });
    }

    renderFixtures(listToDisplay || [], container);
  });
}

/* ------------------------------------------------------------------ */
/* Render engine — single-pass partition + DocumentFragment           */
/* ------------------------------------------------------------------ */
function renderFixtures(matches, container, options = {}) {
  const { skipDateHeaders = false, isEnglandStrip = false } = options;
  const isListContainer =
    container.tagName === "UL" || container.tagName === "OL";
  container.innerHTML = "";
  container.setAttribute("aria-busy", "true");

  if (!matches || matches.length === 0) {
    const emptyState = document.createElement("div");
    emptyState.className = "c-loader";
    emptyState.style.padding = "var(--space-12)";
    emptyState.innerHTML = `<p class="u-caption">No matches found in this category.</p>`;
    container.appendChild(emptyState);
    container.setAttribute("aria-busy", "false");
    return;
  }

  // 1. Deduplicate by composite slug
  const seenSlugs = new Set();
  const cleanMatches = [];

  matches.forEach((m) => {
    if (!m?.datetimeIso) return;
    const slug = `${safe(m.teamA?.name)}-vs-${safe(m.teamB?.name)}-${safe(m.datetimeIso)}`;
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);
    cleanMatches.push(m);
  });

  // 2. Chronological sort
  cleanMatches.sort(
    (a, b) => new Date(a.datetimeIso) - new Date(b.datetimeIso),
  );

  // 3. Single-pass partition by UK calendar date (Europe/London)
  //    Using the raw ISO date here would mis-bucket late kick-offs that cross
  //    midnight UTC but not midnight London (and vice versa).
  const groups = new Map();
  cleanMatches.forEach((m) => {
    const fmt = formatMatchDateTime(m.datetimeIso);
    if (!fmt) return;
    let bucket = groups.get(fmt.dateInputValue);
    if (!bucket) {
      bucket = { dateLong: fmt.dateLong, matches: [] };
      groups.set(fmt.dateInputValue, bucket);
    }
    bucket.matches.push(m);
  });

  // 4. DocumentFragment build
  const fragment = document.createDocumentFragment();

  groups.forEach(({ dateLong, matches }) => {
    if (!skipDateHeaders) {
      const dateHeader = document.createElement("div");
      dateHeader.className = "p-fixtures__date-header";
      dateHeader.textContent = dateLong;
      fragment.appendChild(dateHeader);
    }

    matches.forEach((match) => {
      const row = createFixtureRow(match, { isEnglandStrip });
      if (isListContainer) {
        const li = document.createElement("li");
        li.appendChild(row);
        fragment.appendChild(li);
      } else {
        fragment.appendChild(row);
      }
    });
  });

  container.appendChild(fragment);
  container.setAttribute("aria-busy", "false");
}

/* ------------------------------------------------------------------ */
/* Row factory — with date display for England strip                  */
/* ------------------------------------------------------------------ */
function createFixtureRow(match, options = {}) {
  const { isEnglandStrip = false } = options;
  const fmt = formatMatchDateTime(match.datetimeIso);
  const timeStr = fmt ? fmt.time : "";
  // For England strip: include full date + day in meta
  const dateStr = fmt ? fmt.dateShort : "";

  const isEngland =
    safe(match.teamA?.name).toLowerCase() === "england" ||
    safe(match.teamB?.name).toLowerCase() === "england";

  // 3-hour cut-off: row is interactive only when match.isBookable is true.
  // Non-bookable rows render as a <div> (no <a>) carrying a "Walk-ins Only"
  // badge in place of the navigation arrow.
  const isBookable = match.isBookable === true;
  let row;
  if (isBookable) {
    let bookingUrl = "zones.html";
    try {
      bookingUrl = buildZonesURL(match);
    } catch (e) {
      console.warn("fixturesPage: buildZonesURL failed", e);
    }
    row = document.createElement("a");
    row.href = bookingUrl;
  } else {
    row = document.createElement("div");
  }
  row.className = `c-fixture-row${isEngland ? " c-fixture-row--england" : ""}${
    isBookable ? "" : " c-fixture-row--locked"
  }`;

  // Teams
  const teamsDiv = document.createElement("div");
  teamsDiv.className = "c-fixture-row__teams";

  const makeTeam = (teamData) => {
    const team = document.createElement("span");
    team.className = "c-fixture-row__team";
    const flag = document.createElement("span");
    flag.className = "c-fixture-row__flag";
    flag.style.backgroundImage = safeBackgroundUrl(teamData?.flag);
    team.appendChild(flag);
    team.appendChild(document.createTextNode(safe(teamData?.name)));
    return team;
  };

  const vs = document.createElement("span");
  vs.className = "c-fixture-row__vs";
  vs.textContent = "VS";

  teamsDiv.appendChild(makeTeam(match.teamA));
  teamsDiv.appendChild(vs);
  teamsDiv.appendChild(makeTeam(match.teamB));

  // Meta — date handling per context
  const metaDiv = document.createElement("div");
  metaDiv.className = "c-fixture-row__meta";

  const timeEl = document.createElement("time");
  if (safe(match.datetimeIso))
    timeEl.setAttribute("datetime", safe(match.datetimeIso));

  // England strip shows: "Mon 12 Jun · 20:00" — full date + time
  // Full list shows: "20:00" — time only (date is in the sticky header above)
  if (isEnglandStrip) {
    timeEl.textContent = `${dateStr} · ${timeStr}`;
  } else {
    timeEl.textContent = timeStr;
  }
  metaDiv.appendChild(timeEl);

  if (match.badge) {
    const badge = document.createElement("span");
    badge.textContent = ` · ${safe(match.badge)}`;
    metaDiv.appendChild(badge);
  }

  row.appendChild(teamsDiv);
  row.appendChild(metaDiv);

  if (isBookable) {
    // Arrow CTA — same grid cell that the walk-ins badge will occupy when
    // the row is locked, so the column 2 layout stays identical.
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

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M9 18l6-6-6-6");
    arrowSvg.appendChild(path);
    row.appendChild(arrowSvg);
  } else {
    const lockBadge = document.createElement("span");
    lockBadge.className = "c-badge c-badge--muted c-fixture-row__lock-badge";
    lockBadge.textContent = "Walk-ins Only";
    row.appendChild(lockBadge);
  }

  return row;
}
