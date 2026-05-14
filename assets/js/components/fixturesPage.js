import { buildBookingURL, safeBackgroundUrl } from "../lib/urlHelpers.js";

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

  // 3. Single-pass partition by date
  const groups = new Map();
  cleanMatches.forEach((m) => {
    const dateKey = m.datetimeIso.split("T")[0];
    if (!groups.has(dateKey)) groups.set(dateKey, []);
    groups.get(dateKey).push(m);
  });

  // 4. DocumentFragment build
  const fragment = document.createDocumentFragment();

  groups.forEach((dayMatches, dateKey) => {
    if (!skipDateHeaders) {
      const dateHeader = document.createElement("div");
      dateHeader.className = "p-fixtures__date-header";
      const d = new Date(dateKey + "T12:00:00");
      dateHeader.textContent = isNaN(d)
        ? dateKey
        : d.toLocaleDateString("en-GB", {
            weekday: "long",
            day: "numeric",
            month: "long",
          });
      fragment.appendChild(dateHeader);
    }

    dayMatches.forEach((match) => {
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
  const dateObj = new Date(safe(match.datetimeIso));

  const timeStr = isNaN(dateObj)
    ? ""
    : dateObj.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

  // For England strip: include full date + day in meta
  const dateStr = isNaN(dateObj)
    ? ""
    : dateObj.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

  let bookingUrl = "#";
  try {
    bookingUrl = buildBookingURL(match);
  } catch (e) {
    console.warn("fixturesPage: buildBookingURL failed", e);
  }

  const isEngland =
    safe(match.teamA?.name).toLowerCase() === "england" ||
    safe(match.teamB?.name).toLowerCase() === "england";

  const a = document.createElement("a");
  a.className = `c-fixture-row${isEngland ? " c-fixture-row--england" : ""}`;
  a.href = bookingUrl;

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

  // Arrow
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

  a.appendChild(teamsDiv);
  a.appendChild(metaDiv);
  a.appendChild(arrowSvg);

  return a;
}
