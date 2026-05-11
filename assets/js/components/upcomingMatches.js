// File: assets/js/components/upcomingMatches.js

/* =========================================================================
   UPCOMING MATCHES COMPONENT
   Renders pre-prepared feeds (upcoming, england) and provides client-side filters.
   ========================================================================= */

let matchCache = null; // Store the whole response for filtering and switching feeds

export function renderUpcomingList(data) {
  const container = document.getElementById("upcoming-fixtures-list");
  const filterNav = document.getElementById("fixture-filters");
  if (!container || !data) return;

  // Cache the entire payload (contains upcoming, england, etc.)
  matchCache = data;

  // Initialize filter UI once
  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container);
    filterNav.dataset.initialized = "true";
  }

  // Initial render: show the "upcoming" feed if available, otherwise fallback to england or empty
  const initialList = Array.isArray(matchCache.upcoming)
    ? matchCache.upcoming
    : Array.isArray(matchCache.england)
      ? matchCache.england
      : [];
  updateUI(initialList, container);
}

function setupFilters(nav, container) {
  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;

    // UI: Update active state
    nav.querySelectorAll(".c-chip").forEach((c) => {
      c.classList.remove("c-chip--active");
      c.setAttribute("aria-pressed", "false");
    });
    btn.classList.add("c-chip--active");
    btn.setAttribute("aria-pressed", "true");

    const filterType = btn.dataset.filter;
    let listToDisplay = [];

    // LOGIC: Choose the appropriate pre-prepared feed or derive a filtered list
    if (filterType === "all") {
      listToDisplay = Array.isArray(matchCache.upcoming)
        ? matchCache.upcoming
        : [];
    } else if (filterType === "england") {
      listToDisplay = Array.isArray(matchCache.england)
        ? matchCache.england
        : [];
    } else if (filterType === "knockout") {
      listToDisplay = (
        Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []
      ).filter((m) => m.badge === "Knockout");
    } else if (filterType === "weekend") {
      listToDisplay = (
        Array.isArray(matchCache.upcoming) ? matchCache.upcoming : []
      ).filter((m) => {
        const d = new Date(m.datetimeIso);
        const day = isNaN(d) ? -1 : d.getDay();
        return day === 0 || day === 6; // Sunday (0) or Saturday (6)
      });
    }

    updateUI(listToDisplay, container);
  });
}

function safe(v, fallback = "") {
  return v === undefined || v === null ? fallback : v;
}

function updateUI(matches, container) {
  container.innerHTML = "";

  if (!matches || matches.length === 0) {
    container.innerHTML = `<li class="u-dim u-text-center u-p-8">No matches scheduled for this selection.</li>`;
    return;
  }

  // Display up to 5 items to keep the homepage tidy
  matches.slice(0, 5).forEach((match) => {
    const date = new Date(safe(match.datetimeIso));
    const dateStr = isNaN(date)
      ? ""
      : date.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });
    const timeStr = isNaN(date)
      ? ""
      : date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        });

    const teamAName = safe(match.teamA && match.teamA.name);
    const teamBName = safe(match.teamB && match.teamB.name);
    const teamAFlag = safe(match.teamA && match.teamA.flag);
    const teamBFlag = safe(match.teamB && match.teamB.flag);
    const badge = safe(match.badge);

    const li = document.createElement("li");
    li.innerHTML = `
      <a class="c-fixture-row" href="/fixtures.html">
        <div class="c-fixture-row__teams">
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: ${teamAFlag ? `url('${teamAFlag}')` : "none"}" aria-hidden="true"></span>
            ${teamAName}
          </span>
          <span class="c-fixture-row__vs">vs</span>
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: ${teamBFlag ? `url('${teamBFlag}')` : "none"}" aria-hidden="true"></span>
            ${teamBName}
          </span>
        </div>
        <p class="c-fixture-row__meta">${dateStr}${dateStr && timeStr ? " · " : ""}${timeStr}${(dateStr || timeStr) && badge ? " · " : ""}${badge}</p>
        <span class="c-fixture-row__arrow" aria-hidden="true">→</span>
      </a>
    `;
    container.appendChild(li);
  });
}
