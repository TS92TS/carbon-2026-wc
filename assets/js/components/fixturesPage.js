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
  getHeadlineMatches,
  tlaOf,
  isAnonymousMatch,
} from "../lib/matchData.js";
import {
  TROPHY_SVG_MARKUP,
  VALID_FILTERS,
  VALID_ZONES,
  ZONE_DATA,
} from "../lib/constants.js";

const safe = (v) => (v === undefined || v === null ? "" : v);

let matchCache = null;

/** "England's tournament is over" probe — mirror of the helper in
 *  upcomingMatches.js. Drives the chip rename + HQ-strip swap. */
function isEnglandFallbackActive() {
  if (!matchCache) return false;
  return (
    !Array.isArray(matchCache.england) || matchCache.england.length === 0
  );
}

/* -------------------------------------------------------------------------
   PATH B FUNNEL STATE — user arrived via zones.html → fixtures.html?zone=…
   On Path B the page operates as Step 2:
     • zone-context banner mounts above the schedule
     • fixture-row CTAs short-circuit zones.html and link straight to
       book.html with the zone baked in
   URL is the single source of truth — no sessionStorage recovery so
   direct visits never surface false step indicators.
   ------------------------------------------------------------------------- */
let activeZoneSlug = null;

/**
 * Resolve zone-context from the URL. Valid slug → return + banner mounts;
 * invalid slug → scrub from address bar + return null; missing → null.
 */
function resolveZoneContext(urlParams) {
  const fromUrl = urlParams.get("zone");
  if (!fromUrl) return null;
  if (VALID_ZONES.has(fromUrl)) return fromUrl;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("zone");
    window.history.replaceState(null, "", url.toString());
  } catch (e) {
    /* address-bar tidy-up is non-essential */
  }
  return null;
}

function mountZoneBanner(zoneSlug) {
  const banner = document.getElementById("zone-banner");
  const nameEl = document.getElementById("zone-banner-name");
  if (!banner || !nameEl) return;
  nameEl.textContent = (ZONE_DATA[zoneSlug]?.name || zoneSlug).toUpperCase();
  banner.removeAttribute("hidden");
}

/** Initialise the full fixtures-page rendering. */
export function initFixturesPage(data) {
  const container = document.getElementById("fixtures-list");
  const englandContainer = document.getElementById("england-fixtures-list");
  const filterNav = document.getElementById("fixture-filters");
  if (!container || !data) return;

  matchCache = data;

  // Resolve zone context first so downstream row builders all see the
  // same `activeZoneSlug` and emit consistent hrefs.
  const urlParams = new URLSearchParams(window.location.search);
  activeZoneSlug = resolveZoneContext(urlParams);
  if (activeZoneSlug) mountZoneBanner(activeZoneSlug);

  // England HQ strip — swaps to headline knockouts when England are out.
  // "Priority" kicker stays because the strip's function (priority
  // content) hasn't changed, only its subject.
  if (englandContainer) {
    const fallbackActive = isEnglandFallbackActive();
    const stripMatches = fallbackActive
      ? getHeadlineMatches(matchCache)
      : matchCache.england;

    const stripHeading = document.getElementById("england-heading");
    if (stripHeading) {
      stripHeading.textContent = fallbackActive
        ? "Headline Knockouts"
        : "England Fixtures";
    }

    if (Array.isArray(stripMatches) && stripMatches.length > 0) {
      renderFixtures(stripMatches, englandContainer, {
        skipDateHeaders: true,
        isEnglandStrip: true,
      });
    } else {
      englandContainer.innerHTML =
        '<li class="u-dim u-tiny" style="padding:var(--space-4)">No fixtures scheduled.</li>';
      englandContainer.setAttribute("aria-busy", "false");
    }
  }

  // Resolve initial filter from URL > HTML default > "all".
  const params = new URLSearchParams(window.location.search);
  const urlFilter = params.get("filter");
  const htmlDefault = filterNav ? filterNav.dataset.defaultFilter : null;
  let initialFilter = urlFilter || htmlDefault || "all";
  if (!VALID_FILTERS.has(initialFilter)) initialFilter = "all";

  if (filterNav && !filterNav.dataset.initialized) {
    setupFilters(filterNav, container, initialFilter);
    filterNav.dataset.initialized = "true";
  }

  renderFixtures(getFilteredDataset(initialFilter), container);
}

/** Maps a filter key to its match dataset. */
function getFilteredDataset(filter) {
  if (!matchCache) return [];
  const upcoming = Array.isArray(matchCache.upcoming)
    ? matchCache.upcoming
    : [];
  const england = Array.isArray(matchCache.england) ? matchCache.england : [];

  switch (filter) {
    case "england":
      // Same swap as the home-page chip — see syncChipStates for the
      // matching visible-label rename.
      return isEnglandFallbackActive() ? getHeadlineMatches(matchCache) : england;
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

    // Chip label "England" → "Headlines" once England exit. Filter key
    // stays "england" so URL routing is unaffected.
    const englandChip = nav.querySelector('[data-filter="england"]');
    if (englandChip) {
      englandChip.textContent = isEnglandFallbackActive()
        ? "Headlines"
        : "England";
    }
  };

  const applyFilters = () => {
    syncChipStates();

    // Persist the choice in the URL so it survives reload + sharing.
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("filter", activeFilter);
      window.history.replaceState(null, "", url.toString());
    } catch (historyErr) {
      console.warn("fixturesPage: replaceState failed", historyErr);
    }

    renderFixtures(getFilteredDataset(activeFilter), container);
  };

  // First pass overrides any static `c-chip--active` flag in the HTML.
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

  const isAnonymous = isAnonymousMatch(match);
  const isBookable = match.isBookable === true;

  let row;
  if (isBookable) {
    // Path B (zone already chosen) → skip zones.html, go straight to
    // book.html with the full carry. Path A → handoff via zones.html.
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
  row.className = [
    "c-fixture-row",
    isEngland ? "c-fixture-row--england" : "",
    isBookable ? "" : "c-fixture-row--locked",
    isAnonymous ? "c-fixture-row--milestone" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Leading content: teams + flags, or milestone (trophy + stage label).
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

    const makeTeam = (teamData) => {
      const team = document.createElement("span");
      team.className = "c-fixture-row__team";

      const flag = document.createElement("span");
      flag.className = "c-fixture-row__flag";
      flag.style.backgroundImage = safeBackgroundUrl(teamData?.flag);
      team.appendChild(flag);

      // Both name and TLA in the DOM; CSS toggles by viewport width.
      // `display: none` on the hidden variant removes it from the a11y
      // tree as well as the visual flow.
      const fullName = safe(teamData?.name).trim() || "TBD";

      const nameSpan = document.createElement("span");
      nameSpan.className = "c-fixture-row__name";
      nameSpan.textContent = fullName;
      team.appendChild(nameSpan);

      const tlaSpan = document.createElement("span");
      tlaSpan.className = "c-fixture-row__tla";
      tlaSpan.textContent = tlaOf(teamData);
      team.appendChild(tlaSpan);

      return team;
    };

    const vs = document.createElement("span");
    vs.className = "c-fixture-row__vs";
    vs.textContent = "VS";

    leadingDiv.appendChild(makeTeam(match.teamA));
    leadingDiv.appendChild(vs);
    leadingDiv.appendChild(makeTeam(match.teamB));
  }

  const metaDiv = document.createElement("div");
  metaDiv.className = "c-fixture-row__meta";

  const timeEl = document.createElement("time");
  if (safe(match.datetimeIso))
    timeEl.setAttribute("datetime", safe(match.datetimeIso));
  timeEl.textContent = `${dateStr} · ${timeStr}`;
  metaDiv.appendChild(timeEl);

  // Stage-label suffix only on the England-strip (skip for milestone
  // variants — they show the stage as the headline already).
  if (isEnglandStrip && match.badge && !isAnonymous) {
    const badge = document.createElement("span");
    badge.textContent = ` · ${getDetailedStageLabel(match)}`;
    metaDiv.appendChild(badge);
  }

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
