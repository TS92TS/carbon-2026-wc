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

    // RESTORED: Manual Logic for derived filters
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
        return day === 0 || day === 6; // Sunday or Saturday
      });
    }

    updateUI(listToDisplay || [], container);
  });
}

function updateUI(matches, container) {
  container.innerHTML = "";
  const safe = (v) => (v === undefined || v === null ? "" : v);

  if (!matches || matches.length === 0) {
    container.innerHTML = '<li class="u-dim u-tiny" style="padding: var(--space-4);">No matches found in this category.</li>';
    return;
  }

  // Maintains the "Optimal Amount" for the Home Feed
  const limitedMatches = matches.slice(0, DISPLAY_LIMIT);

  limitedMatches.forEach((match) => {
    const dateObj = new Date(safe(match.datetimeIso));
    const dateStr = isNaN(dateObj) ? "" : dateObj.toLocaleDateString("en-GB", {
      day: "numeric", month: "short"
    });
    const timeStr = isNaN(dateObj) ? "" : dateObj.toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit"
    });

    const bookingUrl = buildBookingURL(match);

    const li = document.createElement("li");
    li.innerHTML = `
      <a class="c-fixture-row" href="${bookingUrl}">
        <div class="c-fixture-row__teams">
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: url('${safe(match.teamA?.flag)}')"></span>
            ${safe(match.teamA?.name)}
          </span>
          <span class="c-fixture-row__vs">VS</span>
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: url('${safe(match.teamB?.flag)}')"></span>
            ${safe(match.teamB?.name)}
          </span>
        </div>
        <div class="c-fixture-row__meta">
          <time>${dateStr} · ${timeStr}</time>
        </div>
        <svg class="c-fixture-row__arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </a>
    `;
    container.appendChild(li);
  });
}