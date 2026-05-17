import {
  buildBookingURL,
  buildZonesURL,
  safeBackgroundUrl,
} from "../lib/urlHelpers.js";
import {
  formatMatchDateTime,
  getLondonWeekday,
  isKnockoutMatch,
  getDetailedStageLabel,
  getStageGroup,
} from "../lib/matchData.js";

const safe = (v) => (v === undefined || v === null ? "" : v);

let matchCache = null;
const VALID_FILTERS = new Set(["all", "england", "knockout", "weekend"]);

/* -------------------------------------------------------------------------
   PATH B FUNNEL STATE — when the user arrives via the zone-first path
   (zones.html → fixtures.html?zone=<slug>), the page operates as Step 2
   of the booking funnel:
     - A zone-context banner mounts above the schedule.
     - Fixture row CTAs short-circuit zones.html and link straight to
       book.html with the zone slug baked in.

   When `?zone=` is absent (and no session recovery matches), the module
   falls back to general-purpose behaviour and `activeZoneSlug` stays null.
   ------------------------------------------------------------------------- */
// Mirror of booking.js's ZONE_DATA names — must stay in lockstep until we
// lift this to a shared module.
const ZONE_NAMES = {
  carbon: "Main Bar",
  terrace: "The Mill Terrace",
  booth: "VIP Booths",
};
const VALID_ZONES = new Set(Object.keys(ZONE_NAMES));
const ZONE_SESSION_KEY = "carbon_last_fixtures_zone";

let activeZoneSlug = null;

/**
 * Resolve the funnel zone-context. URL is authoritative; an invalid
 * `?zone=` is dropped from the URL (we don't auto-recover when the user
 * explicitly requested a bad zone — respect the rejection). A missing
 * `?zone=` triggers session recovery and, on hit, echoes the slug back
 * into the URL so the banner survives reloads and the URL is shareable.
 */
function resolveZoneContext(urlParams) {
  const fromUrl = urlParams.get("zone");
  if (fromUrl) {
    if (VALID_ZONES.has(fromUrl)) {
      try {
        sessionStorage.setItem(ZONE_SESSION_KEY, fromUrl);
      } catch (storageErr) {
        console.warn("fixturesPage: zone session write failed", storageErr);
      }
      return fromUrl;
    }
    // Invalid ?zone= — scrub from URL, do NOT fall through to recovery.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("zone");
      window.history.replaceState(null, "", url.toString());
    } catch (e) {
      /* noop */
    }
    return null;
  }

  // No URL zone — try session recovery
  try {
    const stored = sessionStorage.getItem(ZONE_SESSION_KEY);
    if (stored && VALID_ZONES.has(stored)) {
      const url = new URL(window.location.href);
      url.searchParams.set("zone", stored);
      window.history.replaceState(null, "", url.toString());
      return stored;
    }
  } catch (storageErr) {
    console.warn("fixturesPage: zone session read failed", storageErr);
  }

  return null;
}

function mountZoneBanner(zoneSlug) {
  const banner = document.getElementById("zone-banner");
  const nameEl = document.getElementById("zone-banner-name");
  if (!banner || !nameEl) return;
  nameEl.textContent = (ZONE_NAMES[zoneSlug] || zoneSlug).toUpperCase();
  banner.removeAttribute("hidden");
}

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

  // Resolve zone context FIRST so every downstream renderRow / createFixtureRow
  // call sees the same `activeZoneSlug` and emits consistent hrefs.
  const urlParams = new URLSearchParams(window.location.search);
  activeZoneSlug = resolveZoneContext(urlParams);
  if (activeZoneSlug) {
    mountZoneBanner(activeZoneSlug);
  }

  // 1. Populate persistent England HQ strip immediately
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

  // 2. === INTENT STATE RESOLUTION CASCADE ===
  // Resolves context arriving from cross-page links or direct bookmarks
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get("filter");
  const htmlDefault = filterNav ? filterNav.dataset.defaultFilter : null;
  let initialFilter = urlFilter || htmlDefault || "all";

  if (!VALID_FILTERS.has(initialFilter)) {
    initialFilter = "all";
  }

  // 3. Initialize interactive filter engines with initial filter state passed in
  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container, initialFilter);
    filterNav.dataset.initialized = "true";
  }

  // 4. Draw correctly segmented datasets on primary layout paint
  const initialList = getFilteredDataset(initialFilter);
  renderFixtures(initialList, container);
}

/**
 * Centrally maps filter states to structural match data scopes
 */
function getFilteredDataset(filter) {
  if (!matchCache) return [];
  const upcoming = Array.isArray(matchCache.upcoming)
    ? matchCache.upcoming
    : [];
  const england = Array.isArray(matchCache.england) ? matchCache.england : [];

  switch (filter) {
    case "england":
      return england;
    case "knockout":
      return upcoming.filter(isKnockoutMatch);
    case "weekend":
      return upcoming.filter((m) => {
        const w = getLondonWeekday(m?.datetimeIso);
        return w === "Saturday" || w === "Sunday";
      });
    case "all":
    default:
      return upcoming;
  }
}

function setupFilters(nav, container, initialFilter) {
  let activeFilter = initialFilter;

  const syncChipStates = () => {
    nav.querySelectorAll(".c-chip").forEach((chip) => {
      const isActive = chip.dataset.filter === activeFilter;
      chip.classList.toggle("c-chip--active", isActive);
      chip.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  };

  const applyFilters = () => {
    syncChipStates();

    // === STATEFUL URL SYNCHRONIZATION ===
    // Keeps current choice alive in address bar for bookmarks and sharing
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("filter", activeFilter);
      window.history.replaceState(null, "", url.toString());
    } catch (historyErr) {
      console.warn(
        "fixturesPage: Failed to replaceState URL parameters",
        historyErr,
      );
    }

    const list = getFilteredDataset(activeFilter);
    renderFixtures(list, container);
  };

  // Run synchronization on first load to override static HTML active flags
  syncChipStates();

  nav.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-filter]");
    if (!btn) return;

    const filter = btn.dataset.filter;
    const targetFilter = VALID_FILTERS.has(filter) ? filter : "all";

    // Standard single-select radio button behavior optimization
    if (activeFilter === targetFilter) return;

    activeFilter = targetFilter;
    applyFilters();
  });
}

/**
 * Stage-grouped accordion renderer.
 */
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

  // Deduplicate by composite slug, then chronological sort
  const seenSlugs = new Set();
  const cleanMatches = [];
  matches.forEach((m) => {
    if (!m?.datetimeIso) return;
    const slug = `${safe(m.teamA?.name)}-vs-${safe(m.teamB?.name)}-${safe(m.datetimeIso)}`;
    if (seenSlugs.has(slug)) return;
    seenSlugs.add(slug);
    cleanMatches.push(m);
  });
  cleanMatches.sort(
    (a, b) => Date.parse(a.datetimeIso) - Date.parse(b.datetimeIso),
  );

  const fragment = document.createDocumentFragment();

  const renderRow = (match, parent) => {
    const row = createFixtureRow(match, { isEnglandStrip });
    if (isListContainer) {
      const li = document.createElement("li");
      li.appendChild(row);
      parent.appendChild(li);
    } else {
      parent.appendChild(row);
    }
  };

  // England priority strip path — flat list, no accordions.
  if (skipDateHeaders) {
    cleanMatches.forEach((match) => renderRow(match, fragment));
    container.appendChild(fragment);
    container.setAttribute("aria-busy", "false");
    return;
  }

  // Stage-accordion path — bucket by tournament stage.
  const stageBuckets = new Map();
  cleanMatches.forEach((m) => {
    const stage = getStageGroup(m);
    if (!stage) return;
    const ms = Date.parse(m.datetimeIso);
    if (Number.isNaN(ms)) return;

    let bucket = stageBuckets.get(stage.key);
    if (!bucket) {
      bucket = {
        key: stage.key,
        label: stage.label,
        order: stage.order,
        firstKickoff: ms,
        lastKickoff: ms,
        matches: [],
      };
      stageBuckets.set(stage.key, bucket);
    }
    bucket.matches.push(m);
    if (ms < bucket.firstKickoff) bucket.firstKickoff = ms;
    if (ms > bucket.lastKickoff) bucket.lastKickoff = ms;
  });

  // Sort buckets in tournament progression order
  const stages = Array.from(stageBuckets.values()).sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.firstKickoff - b.firstKickoff;
  });

  // Build accordions. The FIRST available stage opens automatically
  stages.forEach((stage, idx) => {
    const details = document.createElement("details");
    details.className = "p-fixtures__stage-group";
    details.dataset.stageKey = stage.key;
    if (idx === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.className = "p-fixtures__stage-summary";

    const nameSpan = document.createElement("span");
    nameSpan.className = "p-fixtures__stage-name";
    nameSpan.textContent = stage.label;
    summary.appendChild(nameSpan);

    const metaSpan = document.createElement("span");
    metaSpan.className = "p-fixtures__stage-meta";
    metaSpan.textContent = buildStageMeta(stage);
    summary.appendChild(metaSpan);

    details.appendChild(summary);

    const inner = document.createElement("div");
    inner.className = "p-fixtures__stage-content";
    stage.matches.forEach((match) => renderRow(match, inner));
    details.appendChild(inner);

    fragment.appendChild(details);
  });

  container.appendChild(fragment);
  container.setAttribute("aria-busy", "false");
}

function buildStageMeta(stage) {
  const count = stage.matches.length;
  const countLabel = `${count} game${count === 1 ? "" : "s"}`;

  const first = formatMatchDateTime(new Date(stage.firstKickoff).toISOString());
  const last = formatMatchDateTime(new Date(stage.lastKickoff).toISOString());
  if (!first || !last) return countLabel;

  if (first.dateInputValue === last.dateInputValue) {
    return `${countLabel} · ${first.dateShort}`;
  }
  return `${countLabel} · ${first.dateShort} – ${last.dateShort}`;
}

function createFixtureRow(match, options = {}) {
  const { isEnglandStrip = false } = options;
  const fmt = formatMatchDateTime(match.datetimeIso);
  const timeStr = fmt ? fmt.time : "";
  const dateStr = fmt ? fmt.dateShort : "";

  const isEngland =
    safe(match.teamA?.name).toLowerCase() === "england" ||
    safe(match.teamB?.name).toLowerCase() === "england";

  const isBookable = match.isBookable === true;
  let row;
  if (isBookable) {
    // When zone context is already established (Path B Step 2), skip the
    // zones.html middle step and link straight to book.html with the
    // full carry. Otherwise fall back to the Path A handoff via zones.
    let bookingUrl = "zones.html";
    try {
      bookingUrl = activeZoneSlug
        ? buildBookingURL(match, { zone: activeZoneSlug })
        : buildZonesURL(match);
    } catch (e) {
      console.warn("fixturesPage: URL build failed", e);
    }
    row = document.createElement("a");
    row.href = bookingUrl;
  } else {
    row = document.createElement("div");
  }
  row.className = `c-fixture-row${isEngland ? " c-fixture-row--england" : ""}${
    isBookable ? "" : " c-fixture-row--locked"
  }`;

  const teamsDiv = document.createElement("div");
  teamsDiv.className = "c-fixture-row__teams";

  const makeTeam = (teamData) => {
    const team = document.createElement("span");
    team.className = "c-fixture-row__team";
    const flag = document.createElement("span");
    flag.className = "c-fixture-row__flag";
    flag.style.backgroundImage = safeBackgroundUrl(teamData?.flag);
    team.appendChild(flag);

    const teamName = safe(teamData?.name).trim();
    const displayName = teamName !== "" ? teamName : "TBD";

    team.appendChild(document.createTextNode(displayName));
    return team;
  };

  const vs = document.createElement("span");
  vs.className = "c-fixture-row__vs";
  vs.textContent = "VS";

  teamsDiv.appendChild(makeTeam(match.teamA));
  teamsDiv.appendChild(vs);
  teamsDiv.appendChild(makeTeam(match.teamB));

  const metaDiv = document.createElement("div");
  metaDiv.className = "c-fixture-row__meta";

  const timeEl = document.createElement("time");
  if (safe(match.datetimeIso))
    timeEl.setAttribute("datetime", safe(match.datetimeIso));
  timeEl.textContent = `${dateStr} · ${timeStr}`;
  metaDiv.appendChild(timeEl);

  if (isEnglandStrip && match.badge) {
    const badge = document.createElement("span");
    badge.textContent = ` · ${getDetailedStageLabel(match)}`;
    metaDiv.appendChild(badge);
  }

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
