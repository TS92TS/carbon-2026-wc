/* =========================================================================
   MATCH DATA · network fetch + localStorage cache + trading-rules engine.
   Single authority for fixture timestamps (Europe/London) and viability.
   ========================================================================= */

const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_match_data_cache";

// 24 h · soft-stale flag.   5 d · hard-expire (purged on read).
const CACHE_STALE_THRESH_MS = 24 * 60 * 60 * 1000;
const CACHE_ANCIENT_THRESH_MS = 5 * 24 * 60 * 60 * 1000;

/* Last-resort static dataset for total-cache-blackout conditions
   (incognito + network outage). `updatedAt` is stamped at serve-time
   (see fetchMatchData) so kiosks / long-lived tabs never see a frozen
   module-load timestamp. */
const FALLBACK_DATA = {
  status: "upcoming",
  _source: "static_fallback",
  _isOffline: true,
  upcoming: [
    {
      id: "fallback_2026_eng_md1",
      datetimeIso: "2026-06-12T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
    {
      id: "fallback_2026_eng_md2",
      datetimeIso: "2026-06-18T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
    {
      id: "fallback_2026_eng_md3",
      datetimeIso: "2026-06-24T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
    {
      id: "fallback_2026_wc_final",
      datetimeIso: "2026-07-19T20:00:00+01:00",
      teamA: { name: "TBD", tla: "TBD", flag: "" },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Final",
    },
  ],
  england: [
    {
      id: "fallback_2026_eng_md1",
      datetimeIso: "2026-06-12T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
    {
      id: "fallback_2026_eng_md2",
      datetimeIso: "2026-06-18T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
    {
      id: "fallback_2026_eng_md3",
      datetimeIso: "2026-06-24T19:00:00+01:00",
      teamA: {
        name: "England",
        tla: "ENG",
        flag: "https://crests.football-data.org/770.svg",
      },
      teamB: { name: "TBD", tla: "TBD", flag: "" },
      badge: "Group Stage",
    },
  ],
};

/** Classifies cached-payload freshness: valid / stale / ancient. */
function evaluateCacheAge(parsedData) {
  if (!parsedData || typeof parsedData !== "object") return { isValid: false };

  const timestamp = parsedData.updatedAt || parsedData._cachedAt;
  if (!timestamp) return { isValid: false };

  const ageMs = Date.now() - new Date(timestamp).getTime();
  // Guard against clock skew producing values from the deep future.
  if (!Number.isFinite(ageMs) || ageMs < 0) return { isValid: false };

  if (ageMs >= CACHE_ANCIENT_THRESH_MS) {
    return { isValid: false, isStale: true, isAncient: true };
  }
  return {
    isValid: true,
    isStale: ageMs >= CACHE_STALE_THRESH_MS,
    isAncient: false,
  };
}

/* -------------------------------------------------------------------------
   BOOKING CUTOFF · online reservations close 3h before kickoff. Matches
   stay visible in feeds (people still want the schedule) but the funnel
   closes and the UI degrades to a "Walk-ins Only" affordance.
   ------------------------------------------------------------------------- */
const BOOKING_CUTOFF_MS = 3 * 60 * 60 * 1000;

function isMatchBookable(match, now) {
  if (!match?.datetimeIso) return false;
  const kickoffMs = Date.parse(match.datetimeIso);
  if (Number.isNaN(kickoffMs)) return false;
  return kickoffMs - now > BOOKING_CUTOFF_MS;
}

/**
 * Stamps `isBookable` on every match in `data.upcoming` and `data.england`.
 * Re-run on every read (live + cache paths) so the value is always fresh
 * relative to "now" rather than the moment of cache write.
 */
function stampBookable(data) {
  if (!data || typeof data !== "object") return data;
  const now = Date.now();
  for (const key of ["upcoming", "england"]) {
    const arr = data[key];
    if (!Array.isArray(arr)) continue;
    for (const m of arr) {
      if (m && typeof m === "object") {
        m.isBookable = isMatchBookable(m, now);
      }
    }
  }
  return data;
}

/* -------------------------------------------------------------------------
   TRADING-DAY RULES ENGINE · drops late-night fixtures that would breach
   the licence. Pure projection from raw API → UI-visible, never mutates
   the cached payload.

   Rule A   home-nations (Tier 0) always viable.
   Rule B   kickoffs 00:00–04:59 London → evaluate against the previous
            calendar day's trading slot (Sat 01:30 = Friday trading day).
   Opening  kickoffs 05:00–10:59 dropped: too late for last night's licence,
   gate     too early for opening (11:00). Tier 0 passes via Rule A; inner
            re-check is defence-in-depth.
   Rule C   knockout duration 3h (ET + pens), group 2h.
   Rule D   hard-close by weekday: Mon–Thu 02:00, Fri/Sat 03:30, Sun 01:00.
            Sunday Gov Extension lifts Sun close to 02:00 only when ALL of:
              date ∈ {2026-07-14, 2026-07-15, 2026-07-19}
              ∧ stage ∈ {Semi-Final, Final}
              ∧ a Tier-0 team is playing
              ∧ kickoff hour ∈ {21, 22}.
   Rule E   viable if expectedEnd ≤ hardClose. Otherwise Tier 1 / knockout
            still passes (Ops will apply a TEN). Everything else drops.
   ------------------------------------------------------------------------- */
const TIER_0_TEAMS = ["England", "Scotland", "Wales", "Northern Ireland"];
const TIER_1_TEAMS = [
  "Brazil",
  "Argentina",
  "France",
  "Spain",
  "Germany",
  "Portugal",
  "USA",
  "Italy",
  "Netherlands",
];
const KNOCKOUT_STAGES = [
  "Round of 32",
  "Round of 16",
  "Quarter-Final",
  "Semi-Final",
  "Final",
];

const MATCH_DURATION_GROUP_MS = 2 * 60 * 60 * 1000;
const MATCH_DURATION_KNOCKOUT_MS = 3 * 60 * 60 * 1000;
const TRADING_NIGHT_END_HOUR = 5; // 00:00–04:59 → prior trading day
const COMPLEX_OPEN_HOUR = 11; // 11:00 — hard opening floor for non-Tier-0 fixtures

const HARD_CLOSE_BY_WEEKDAY = {
  Monday: { hour: 2, minute: 0 },
  Tuesday: { hour: 2, minute: 0 },
  Wednesday: { hour: 2, minute: 0 },
  Thursday: { hour: 2, minute: 0 },
  Friday: { hour: 3, minute: 30 },
  Saturday: { hour: 3, minute: 30 },
  Sunday: { hour: 1, minute: 0 },
};
const SUNDAY_GOV_EXTENDED_CLOSE = { hour: 2, minute: 0 };
const SUNDAY_GOV_EXTENSION_DATES = new Set([
  "2026-07-14",
  "2026-07-15",
  "2026-07-19",
]);

// Shared London UK time formatter — single instance, reused for every match.
const fmtTradingParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/London",
  weekday: "long",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function readLondonParts(dateOrMs) {
  const d = dateOrMs instanceof Date ? dateOrMs : new Date(dateOrMs);
  if (isNaN(d.getTime())) return null;
  const parts = Object.create(null);
  for (const p of fmtTradingParts.formatToParts(d)) parts[p.type] = p.value;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    weekday: parts.weekday,
  };
}

/**
 * London wall-clock → UTC ms instant. The iterative offset resolution
 * survives BST↔GMT transitions (the tournament is fully inside BST but
 * generic handling protects against future schedule edits across DST).
 */
function londonWallClockToUtcMs(year, month, day, hour, minute) {
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let utc = target;
  for (let i = 0; i < 2; i++) {
    const observed = readLondonParts(utc);
    if (!observed) return utc;
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
    );
    const offset = observedAsUtc - utc;
    if (offset === 0) break;
    utc = target - offset;
  }
  return utc;
}

function getTeamNames(match) {
  const a = match?.team1 ?? match?.teamA?.name ?? "";
  const b = match?.team2 ?? match?.teamB?.name ?? "";
  return [String(a).trim(), String(b).trim()];
}

function getStage(match) {
  return String(match?.stage ?? match?.badge ?? "").trim();
}

/**
 * Forgiving knockout detection. Exact match against KNOCKOUT_STAGES first,
 * substring fallback for legacy badge formats ("Knockout: Round of 16").
 * Erring toward inclusion is safe — the knockout signal only upgrades a
 * match (longer duration budget + TEN fallback), never drops one.
 */
function isKnockoutStage(stage) {
  if (!stage) return false;
  if (KNOCKOUT_STAGES.includes(stage)) return true;
  const lower = stage.toLowerCase();
  if (lower.includes("knockout")) return true;
  return KNOCKOUT_STAGES.some((s) => lower.includes(s.toLowerCase()));
}

function getTradingDay(londonParts) {
  if (londonParts.hour < TRADING_NIGHT_END_HOUR) {
    // Anchor at noon UTC for DST safety, step back 24h, re-read in London.
    const anchor = Date.UTC(
      londonParts.year,
      londonParts.month - 1,
      londonParts.day,
      12,
    );
    const prev = readLondonParts(anchor - 24 * 60 * 60 * 1000);
    if (prev) return prev;
  }
  return {
    year: londonParts.year,
    month: londonParts.month,
    day: londonParts.day,
    weekday: londonParts.weekday,
  };
}

function computeHardCloseUtcMs(tradingDay, londonParts, stage, team1, team2) {
  const base = HARD_CLOSE_BY_WEEKDAY[tradingDay.weekday];
  if (!base) return null;

  let close = base;
  if (tradingDay.weekday === "Sunday") {
    const matchDate =
      `${londonParts.year}-${String(londonParts.month).padStart(2, "0")}-` +
      `${String(londonParts.day).padStart(2, "0")}`;
    const tier0Playing =
      TIER_0_TEAMS.includes(team1) || TIER_0_TEAMS.includes(team2);
    const isSemiOrFinal = stage === "Semi-Final" || stage === "Final";
    const inWindow = londonParts.hour === 21 || londonParts.hour === 22;
    if (
      SUNDAY_GOV_EXTENSION_DATES.has(matchDate) &&
      isSemiOrFinal &&
      tier0Playing &&
      inWindow
    ) {
      close = SUNDAY_GOV_EXTENDED_CLOSE;
    }
  }

  // Hard close lives on the calendar morning AFTER the trading day.
  const anchor = Date.UTC(
    tradingDay.year,
    tradingDay.month - 1,
    tradingDay.day,
    12,
  );
  const nextDay = readLondonParts(anchor + 24 * 60 * 60 * 1000);
  if (!nextDay) return null;

  return londonWallClockToUtcMs(
    nextDay.year,
    nextDay.month,
    nextDay.day,
    close.hour,
    close.minute,
  );
}

function isMatchViable(match) {
  // Fail-closed on malformed input — drops anything we can't reason about.
  if (!match || typeof match !== "object") return false;
  if (!match.datetimeIso) return false;

  const [team1, team2] = getTeamNames(match);

  // Rule A — TIER_0 whitelist
  if (TIER_0_TEAMS.includes(team1) || TIER_0_TEAMS.includes(team2)) {
    return true;
  }

  const kickoffMs = Date.parse(match.datetimeIso);
  if (Number.isNaN(kickoffMs)) return false;

  const london = readLondonParts(kickoffMs);
  if (!london) return false;

  // Opening Hour Gate — drops 05:00–10:59 London kickoffs (too late for
  // last night's licence, too early for the complex opening at 11:00).
  // Tier-0 fixtures already passed via Rule A; the inner re-check is
  // defence-in-depth against future pipeline re-ordering. Fail-closed on
  // non-integer hours.
  const kickoffHour = london.hour;
  if (!Number.isInteger(kickoffHour)) return false;
  if (
    kickoffHour >= TRADING_NIGHT_END_HOUR &&
    kickoffHour < COMPLEX_OPEN_HOUR
  ) {
    if (TIER_0_TEAMS.includes(team1) || TIER_0_TEAMS.includes(team2)) {
      return true;
    }
    return false;
  }

  // Rule B — trading-day shift
  const tradingDay = getTradingDay(london);
  if (!HARD_CLOSE_BY_WEEKDAY[tradingDay.weekday]) return false;

  // Rule C — duration
  const stage = getStage(match);
  const isKnockout = isKnockoutStage(stage);
  const durationMs = isKnockout
    ? MATCH_DURATION_KNOCKOUT_MS
    : MATCH_DURATION_GROUP_MS;

  // Rule D — hard close (with Sunday Gov Extension)
  const hardCloseMs = computeHardCloseUtcMs(
    tradingDay,
    london,
    stage,
    team1,
    team2,
  );
  if (hardCloseMs === null) return false;

  // Rule E — verdict. Late Tier-1 or knockouts still pass (Ops applies a
  // TEN); late group-stage matches between two non-Tier-1 sides drop.
  const expectedEndMs = kickoffMs + durationMs;
  if (expectedEndMs <= hardCloseMs) return true;
  const isTier1 = TIER_1_TEAMS.includes(team1) || TIER_1_TEAMS.includes(team2);
  if (isTier1 || isKnockout) return true;
  return false;
}

/**
 * Pure projection. Returns a fresh data shape with `upcoming` and `england`
 * trimmed to viable matches only — input + localStorage cache untouched.
 * Non-array values pass through so error / "concluded" payloads keep shape.
 */
function filterViableMatches(data) {
  if (!data || typeof data !== "object") return data;
  return {
    ...data,
    upcoming: Array.isArray(data.upcoming)
      ? data.upcoming.filter(isMatchViable)
      : data.upcoming,
    england: Array.isArray(data.england)
      ? data.england.filter(isMatchViable)
      : data.england,
  };
}

// Concurrent callers share one in-flight network promise.
let pendingPromise = null;

/* -------------------------------------------------------------------------
   DATE/TIME FORMATTER · Europe/London for every render surface. The 2026
   World Cup is hosted in North America so API instants sit hours away
   from UK wall-clock time. Formatter instances are constructed once and
   reused (construction is expensive, .format() is effectively free).
   ------------------------------------------------------------------------- */
const UK_LOCALE = "en-GB";
const UK_TZ = "Europe/London";

const fmtDateShort = new Intl.DateTimeFormat(UK_LOCALE, {
  timeZone: UK_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const fmtDateLong = new Intl.DateTimeFormat(UK_LOCALE, {
  timeZone: UK_TZ,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const fmtParts = new Intl.DateTimeFormat(UK_LOCALE, {
  timeZone: UK_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * Convert an ISO timestamp to UK (Europe/London) display + form-input values.
 * Returns `null` for missing/invalid input — callers should treat this as "skip".
 * @param {string} iso - e.g. "2026-06-11T20:00:00+01:00" or "2026-06-11T19:00:00Z"
 * @returns {null | {
 * dateShort: string,        // "Thu 11 Jun" — feed rows, dropdown labels
 * dateLong: string,         // "Thursday 11 June" — sticky date headers
 * time: string,             // "20:00" — 24h Europe/London
 * dateInputValue: string,   // "2026-06-11" — populates <input type="date">
 * iso: string               // pass-through original
 * }}
 */
export function formatMatchDateTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;

  const parts = Object.create(null);
  for (const p of fmtParts.formatToParts(d)) parts[p.type] = p.value;

  return {
    dateShort: fmtDateShort.format(d),
    dateLong: fmtDateLong.format(d),
    time: `${parts.hour}:${parts.minute}`,
    dateInputValue: `${parts.year}-${parts.month}-${parts.day}`,
    iso,
  };
}

/** Long-form weekday of `iso` in Europe/London. "" on missing/invalid input. */
export function getLondonWeekday(iso) {
  if (!iso) return "";
  const parts = readLondonParts(iso);
  return parts ? parts.weekday : "";
}

/** Single authority for "is this a knockout fixture?". */
export function isKnockoutMatch(match) {
  return isKnockoutStage(getStage(match));
}

/**
 * "Fixture has no confirmed teams yet" — treats both "" and "TBD" as
 * anonymous so the helper works against the API response AND the static
 * fallback dataset. Drives the milestone (trophy + stage) presentation.
 */
export function isAnonymousMatch(match) {
  const nameA = (match?.teamA?.name ?? "").trim().toUpperCase();
  const nameB = (match?.teamB?.name ?? "").trim().toUpperCase();
  return (nameA === "" || nameA === "TBD") && (nameB === "" || nameB === "TBD");
}

/**
 * True if `now` falls inside the playing window [kickoff, kickoff + duration).
 * Duration mirrors the trading-rules engine (group 2h, knockout 3h).
 */
export function isMatchLive(match, now = Date.now()) {
  if (!match?.datetimeIso) return false;
  const kickoffMs = Date.parse(match.datetimeIso);
  if (Number.isNaN(kickoffMs)) return false;
  const durationMs = isKnockoutMatch(match)
    ? MATCH_DURATION_KNOCKOUT_MS
    : MATCH_DURATION_GROUP_MS;
  return now >= kickoffMs && now < kickoffMs + durationMs;
}

/**
 * Chronologically nearest England fixture whose playing window hasn't
 * concluded, paired with a live/upcoming flag. Returns `null` when
 * England's tournament is over — callers fall back to getHeadlineMatches.
 */
export function getNextEnglandFocus(data, now = Date.now()) {
  if (!data || !Array.isArray(data.england)) return null;
  const candidates = data.england
    .filter((m) => {
      if (!m?.datetimeIso) return false;
      const kickoffMs = Date.parse(m.datetimeIso);
      if (Number.isNaN(kickoffMs)) return false;
      const durationMs = isKnockoutMatch(m)
        ? MATCH_DURATION_KNOCKOUT_MS
        : MATCH_DURATION_GROUP_MS;
      return kickoffMs + durationMs > now;
    })
    .sort((a, b) => Date.parse(a.datetimeIso) - Date.parse(b.datetimeIso));
  const match = candidates[0];
  if (!match) return null;
  return { match, isLive: isMatchLive(match, now) };
}

/**
 * Fallback dataset surfaced when England exit the tournament: the next
 * `limit` upcoming knockout fixtures, chronological. Lets the home /
 * fixtures "England" chip silently swap to a meaningful headline list.
 */
export function getHeadlineMatches(data, { limit = 4, now = Date.now() } = {}) {
  if (!data || !Array.isArray(data.upcoming)) return [];
  return data.upcoming
    .filter(isKnockoutMatch)
    .filter((m) => {
      const kickoffMs = Date.parse(m?.datetimeIso);
      if (Number.isNaN(kickoffMs)) return false;
      return kickoffMs + MATCH_DURATION_KNOCKOUT_MS > now;
    })
    .sort((a, b) => Date.parse(a.datetimeIso) - Date.parse(b.datetimeIso))
    .slice(0, limit);
}

/* Compact stage label for tight contexts (marquee). Built on
   getDetailedStageLabel so authorities stay unified — pure presentation
   map; unknown labels fall through unchanged. */
const SHORT_STAGE_MAP = {
  "GROUP STAGE": "GROUP",
  "ROUND OF 32": "R32",
  "ROUND OF 16": "R16",
  "QUARTER-FINAL": "QF",
  "SEMI-FINAL": "SF",
  "WORLD CUP FINAL": "FINAL",
  "3rd Place Play-Off": "3RD PLACE",
  "Knockout Stage": "KNOCKOUT",
};

export function getShortStageLabel(match) {
  const long = getDetailedStageLabel(match);
  return SHORT_STAGE_MAP[long] || long;
}

/* Title-case stage labels for non-UI contexts (Tally emails, Sheets rows)
   where SHOUTY all-caps reads as unprofessional. UI surfaces keep the
   uppercase form via getDetailedStageLabel. */
const STAGE_LABEL_DISPLAY = {
  "GROUP STAGE": "Group Stage",
  "ROUND OF 32": "Round of 32",
  "ROUND OF 16": "Round of 16",
  "QUARTER-FINAL": "Quarter-Final",
  "SEMI-FINAL": "Semi-Final",
  "WORLD CUP FINAL": "World Cup Final",
  "3rd Place Play-Off": "3rd Place Play-Off",
  "Knockout Stage": "Knockout Stage",
};

/**
 * Human-readable fixture identifier for the Tally form payload
 * (confirmation email + Sheets ledger). NOT the URL slug — slugs stay
 * machine-parseable for routing; this is the human-facing boundary.
 *   - Anonymous TBD-vs-TBD knockouts → title-case stage label ("Quarter-Final")
 *   - Confirmed fixtures             → "TeamA vs TeamB" with API casing
 */
export function formatFixtureDisplay(match) {
  if (isAnonymousMatch(match)) {
    const raw = getDetailedStageLabel(match);
    return STAGE_LABEL_DISPLAY[raw] || raw || "Knockout Match";
  }
  const nameA = (match?.teamA?.name ?? "").trim() || "TBD";
  const nameB = (match?.teamB?.name ?? "").trim() || "TBD";
  return `${nameA} vs ${nameB}`;
}

/**
 * 3-letter team abbreviation for compact rendering. Prefers API-supplied
 * `tla`; falls back to first three letters of `name`; "TBD" for
 * anonymous knockout placeholders. Always uppercase, never empty.
 */
export function tlaOf(team) {
  const tla = (team?.tla ?? "").trim();
  if (tla) return tla.toUpperCase();
  const name = (team?.name ?? "").trim();
  if (name) return name.slice(0, 3).toUpperCase();
  return "TBD";
}

/**
 * Fetch with localStorage fallback. Worker handles retry/caching;
 * frontend trusts 200 or falls back. Concurrent callers share one
 * in-flight promise via pendingPromise.
 */
export async function getMatchData() {
  if (pendingPromise) return pendingPromise;

  pendingPromise = fetchMatchData();

  try {
    return await pendingPromise;
  } finally {
    pendingPromise = null;
  }
}

export async function fetchMatchData() {
  try {
    const response = await fetch(API_URL, {
      method: "GET",
      mode: "cors",
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));

      if (errorData.error === "CIRCUIT_BREAKER_TRIGGERED") {
        console.error(
          "MatchData Lib: Worker halted due to excessive sub-requests.",
        );
      } else if (errorData.error === "Loop detected") {
        console.error("MatchData Lib: Infinite loop protection triggered.");
      }

      // Fail fast on all errors — the Worker has already cached internally
      throw new Error(errorData.error || `API_ERROR_${response.status}`);
    }

    const data = await response.json();
    const enrichedData = { ...data, _source: "live" };

    // Cache BEFORE read-time enrichment. The persisted blob must stay
    // the raw API payload: isBookable and the viability filter are both
    // functions of "now" and are recomputed on every read.
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enrichedData));
    } catch (storageErr) {
      console.warn("MatchData Lib: Failed to write cache", storageErr.message);
    }

    return filterViableMatches(stampBookable(enrichedData));
  } catch (error) {
    console.warn(
      "MatchData Lib: Falling back to local cache due to network fault",
      error.message,
    );

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const cacheStatus = evaluateCacheAge(parsed);

        if (cacheStatus.isValid) {
          // Serve cached data; layout uses _isStale for soft warnings.
          return filterViableMatches(
            stampBookable({
              ...parsed,
              _source: "local_cache",
              _isOffline: true,
              _isStale: cacheStatus.isStale,
            }),
          );
        } else if (cacheStatus.isAncient) {
          localStorage.removeItem(STORAGE_KEY);
          console.warn("MatchData Lib: Purged ancient cache");
        }
      }
    } catch (cacheErr) {
      console.warn("MatchData Lib: Cache parse failed", cacheErr.message);
    }

    // Last resort: network down AND cache empty/purged. Serve static
    // fallback so the funnel still has data to render against.
    console.warn("MatchData Lib: Total blackout — serving static fallback.");
    return filterViableMatches(
      stampBookable({
        ...FALLBACK_DATA,
        _isBlackoutActive: true,
        updatedAt: new Date().toISOString(),
      }),
    );
  }
}

/* Major milestone classifier (R16 → Final + 3rd-place). Group stage + R32
   excluded — these are the high-yield fixtures surfaced at the top of
   the booking dropdown / milestone optgroup. */
const MILESTONE_LABELS = new Set([
  "ROUND OF 16",
  "QUARTER-FINAL",
  "SEMI-FINAL",
  "WORLD CUP FINAL",
  "3rd Place Play-Off",
]);

export function isMilestoneMatch(match) {
  return MILESTONE_LABELS.has(getDetailedStageLabel(match));
}

/**
 * Stage-group classifier for the fixtures-page accordion. Returns
 * `{ key, label, order }` so the renderer can bucket, sort in tournament
 * progression, and display a user-friendly label.
 * Group Stage is sub-divided into Matchdays 1–3 (London calendar date)
 * so no single bucket exceeds ~24 games.
 */
export function getStageGroup(match) {
  const label = getDetailedStageLabel(match);

  switch (label) {
    case "WORLD CUP FINAL":
      return { key: "final", label: "World Cup Final", order: 90 };
    case "3rd Place Play-Off":
      return { key: "third-place", label: "3rd Place Play-Off", order: 80 };
    case "SEMI-FINAL":
      return { key: "semi-final", label: "Semi-Finals", order: 70 };
    case "QUARTER-FINAL":
      return { key: "quarter-final", label: "Quarter-Finals", order: 60 };
    case "ROUND OF 16":
      return { key: "round-of-16", label: "Round of 16", order: 50 };
    case "ROUND OF 32":
      return { key: "round-of-32", label: "Round of 32", order: 40 };
    case "Knockout Stage":
      // Defensive bucket — match flagged knockout but date didn't slot
      // into a known range. Stays grouped between R32 and group stage.
      return { key: "knockout-misc", label: "Knockout Stage", order: 35 };
  }

  // Group Stage — sub-divided by matchday window (Europe/London calendar)
  const fmt = formatMatchDateTime(match?.datetimeIso);
  if (!fmt) {
    return { key: "group-stage", label: "Group Stage", order: 10 };
  }
  const d = fmt.dateInputValue;
  if (d <= "2026-06-17") {
    return { key: "group-md1", label: "Group Stage · Matchday 1", order: 11 };
  }
  if (d <= "2026-06-24") {
    return { key: "group-md2", label: "Group Stage · Matchday 2", order: 12 };
  }
  if (d <= "2026-06-27") {
    return { key: "group-md3", label: "Group Stage · Matchday 3", order: 13 };
  }
  // Fallback for any group-flagged match outside the matchday windows.
  return { key: "group-stage", label: "Group Stage", order: 10 };
}

/**
 * Authoritative tournament phase name. Prefers the edge server's
 * pre-calculated `stageLabel`; falls back to a London-tz date decoder
 * against the 2026 World Cup calendar.
 */
export function getDetailedStageLabel(match) {
  if (match?.stageLabel) return match.stageLabel.toUpperCase();

  if (!match?.badge || !match.badge.toLowerCase().includes("knockout")) {
    return "Group Stage";
  }
  if (!match.datetimeIso) return "Knockout Stage";

  const date = new Date(match.datetimeIso);
  if (isNaN(date.getTime())) return "Knockout Stage";

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });

  const parts = formatter.formatToParts(date);
  const p = Object.create(null);
  for (const part of parts) p[part.type] = part.value;

  const day = parseInt(p.day, 10);
  const month = parseInt(p.month, 10);
  const year = parseInt(p.year, 10);

  // 2026 World Cup knockout calendar
  if (year === 2026 && month === 7) {
    if (day === 19) return "WORLD CUP FINAL";
    if (day === 18) return "3rd Place Play-Off";
    if (day === 14 || day === 15) return "SEMI-FINAL";
    if (day >= 9 && day <= 11) return "QUARTER-FINAL";
    if (day >= 4 && day <= 7) return "ROUND OF 16";
  }
  if (year === 2026) {
    if ((month === 6 && day >= 28) || (month === 7 && day <= 3)) {
      return "ROUND OF 32";
    }
  }

  return "Knockout Stage";
}
