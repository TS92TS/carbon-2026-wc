import { buildBookingURL } from "../lib/urlHelpers.js";

let matchCache = null;
const DISPLAY_LIMIT = 4;

export function renderUpcomingList(data) {
  const container = document.getElementById("upcoming-fixtures-list");
  const filterNav = document.getElementById("fixture-filters");
  if (!container || !data) return;

  matchCache = data;

  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container);
    filterNav.dataset.initialized = "true";
  }

  const initialList = Array.isArray(matchCache.upcoming) ? matchCache.upcoming : [];
  updateUI(initialList, container);
}

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
    } else if (filter === "england") {
      listToDisplay = matchCache.england;
    } else if (filter === "knockout") {
      listToDisplay = (Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []).filter(
        (m) => m.badge && m.badge.toLowerCase().includes("knockout")
      );
    } else if (filter === "weekend") {
      listToDisplay = (Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []).filter((m) => {
        const d = new Date(m.datetimeIso);
        if (isNaN(d.getTime())) return false;
        const day = d.getDay();
        return day === 0 || day === 6;
      });
    }

    updateUI(listToDisplay || [], container);
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
    const dateObj = new Date(safe(match.datetimeIso));
    // FIX: Restored weekday to match previous site behaviour
    const dateStr = isNaN(dateObj) ? "" : dateObj.toLocaleDateString("en-GB", {
      weekday: "short", day: "numeric", month: "short"
    });
    const timeStr = isNaN(dateObj) ? "" : dateObj.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit"
    });

    let bookingUrl = "#";
    try {
      bookingUrl = buildBookingURL(match);
    } catch (e) {
      console.warn("upcomingMatches: buildBookingURL failed", e);
    }

    const li = document.createElement("li");

    const a = document.createElement("a");
    a.className = "c-fixture-row";
    a.href = bookingUrl;

    const teamsDiv = document.createElement("div");
    teamsDiv.className = "c-fixture-row__teams";

    // Team A
    const teamA = document.createElement("span");
    teamA.className = "c-fixture-row__team";
    const flagA = document.createElement("span");
    flagA.className = "c-fixture-row__flag";
    const flagAUrl = safe(match.teamA?.flag);
    if (flagAUrl) flagA.style.backgroundImage = `url('${flagAUrl}')`;
    teamA.appendChild(flagA);
    teamA.appendChild(document.createTextNode(safe(match.teamA?.name)));

    const vs = document.createElement("span");
    vs.className = "c-fixture-row__vs";
    vs.textContent = "VS";

    // Team B
    const teamB = document.createElement("span");
    teamB.className = "c-fixture-row__team";
    const flagB = document.createElement("span");
    flagB.className = "c-fixture-row__flag";
    const flagBUrl = safe(match.teamB?.flag);
    if (flagBUrl) flagB.style.backgroundImage = `url('${flagBUrl}')`;
    teamB.appendChild(flagB);
    teamB.appendChild(document.createTextNode(safe(match.teamB?.name)));

    teamsDiv.appendChild(teamA);
    teamsDiv.appendChild(vs);
    teamsDiv.appendChild(teamB);

    const metaDiv = document.createElement("div");
    metaDiv.className = "c-fixture-row__meta";
    const timeEl = document.createElement("time");
    timeEl.textContent = `${dateStr} · ${timeStr}`;
    metaDiv.appendChild(timeEl);

    const arrowSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
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
    li.appendChild(a);
    fragment.appendChild(li);
  });

  container.appendChild(fragment);
  container.setAttribute("aria-busy", "false");
}