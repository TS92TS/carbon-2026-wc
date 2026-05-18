// File: matchData.js
const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_match_data_cache";

// Cache evaluation thresholds for resilient offline fault tolerance
const CACHE_STALE_THRESH_MS = 24 * 60 * 60 * 1000; // 24 Hours (Soft Warning Flag)
const CACHE_ANCIENT_THRESH_MS = 5 * 24 * 60 * 60 * 1000; // 5 Days (Hard Expiration Gate)

// =========================================================================
// === CRO INSURANCE POLICY: HIGH-AVAILABILITY STATIC EMERGENCY FALLBACK ===
// Executed strictly during total cache blackout conditions (Incognito / Outage)
// Preserves critical funnel conversion paths with true whitelisted names and IDs.
// =========================================================================
// NOTE: `updatedAt` is intentionally NOT baked in here — see the fallback
// branch in fetchMatchData() where it's stamped lazily with `Date.now()`
// at serve-time. A frozen module-load timestamp would lie about freshness
// in long-lived sessions (kiosks, PWAs, idle tabs that survive for hours).
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

/**
 * Evaluates the actual freshness context of stored match payloads.
 * Returns an object detailing whether data should be completely rejected or simply flagged.
 */
function evaluateCacheAge(parsedData) {
  if (!parsedData || typeof parsedData !== "object") return { isValid: false };

  const timestamp = parsedData.updatedAt || parsedData._cachedAt;
  if (!timestamp) return { isValid: false };

  const ageMs = Date.now() - new Date(timestamp).getTime();

  // Guard against corrupted system clocks returning values from the deep future
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
   BOOKING CUTOFF
   Operations policy: online reservations close strictly 3 hours before
   kick-off. After that point matches stay visible in every feed (people
   still want to see the schedule) but the booking funnel is closed and the
   UI degrades to "Walk-ins Only" affordances.
   3 hours = 3 * 60 * 60 * 1000 = 10,800,000 ms — checked from
   `Date.now()` against `Date.parse(match.datetimeIso)`. Both sides are
   UTC-instant integers, so the comparison is timezone-agnostic and
   mathematically precise; no Europe/London conversion needed here.
   ------------------------------------------------------------------------- */
const BOOKING_CUTOFF_MS = 3 * 60 * 60 * 1000;

function isMatchBookable(match, now) {
  if (!match?.datetimeIso) return false;
  const kickoffMs = Date.parse(match.datetimeIso);
  if (Number.isNaN(kickoffMs)) return false;
  return kickoffMs - now > BOOKING_CUTOFF_MS;
}

/**
 * Mutates each match in `data.upcoming` and `data.england`, stamping it with
 * an `isBookable` boolean computed against the current moment. Called on
 * every `getMatchData()` resolution (both live and cache paths) so the
 * value is always fresh — never read from a stale cache write.
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
   TRADING-DAY RULES ENGINE
   Drops low-demand late-night fixtures that would breach the licence. 
   Runs strictly on read (never on cache write), so the persisted
   payload remains the raw API response — the filter is a pure projection
   from raw → UI-visible.

   Rules:
     A — TIER_0_TEAMS (home nations) are always viable.

     B — Kickoffs 00:00–04:59 London evaluate against the PREVIOUS
         calendar day's trading slot (e.g. Sat 01:30 = Friday trading day).

     Opening Hour Gate — Kickoffs 05:00–10:59 UK time are dropped: too late
         to ride the previous night's licence (Rule B) and before the
         complex opens at 11:00. Tier-0 matches in this window pass via
         Rule A; an inner re-check in the gate is defence-in-depth
         against any future re-ordering of the pipeline.
     C — Knockout matches budget 3h (extra time + pens); group stage 2h.
     D — Hard-close per evaluated trading day:
            Mon–Thu → 02:00, Fri/Sat → 03:30, Sun → 01:00.
         Sunday Gov Extension lifts Sun close to 02:00 when ALL of:
            match date ∈ {2026-07-14, 2026-07-15, 2026-07-19}
            AND stage ∈ {Semi-Final, Final}
            AND a Tier-0 team is playing
            AND kickoff hour ∈ {21, 22}.
     E — Viable if expectedEnd ≤ hardClose. Otherwise a Tier-1 / knockout
         match still passes (Ops will apply a TEN). Everything else drops.
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
 * Resolve a Europe/London wall-clock moment to a UTC ms instant.
 * Iterative offset resolution handles BST↔GMT transitions correctly — the
 * tournament sits entirely inside BST (+1h) but writing it generically
 * costs nothing and protects against off-season fixtures or schedule
 * tweaks that brush against a DST changeover.
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
 * Forgiving knockout detection — exact-match against `KNOCKOUT_STAGES`
 * preferred, with a substring fallback for legacy badge formats like
 * "Knockout: Round of 16". Erring toward inclusion is safe because the
 * knockout signal only ever upgrades a match's status (longer duration
 * budget + high-yield TEN fallback) — false positives never silently
 * drop a match.
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

  /* -----------------------------------------------------------------------
     OPENING HOUR GATE — drops morning graveyard kickoffs (05:00–10:59
     London) that fall after the late-night trading shift (Rule B) but
     before the complex opens at 11:00. Tier-0 fixtures already
     short-circuited via Rule A above; the inner re-check below is a
     defence-in-depth guard so any future pipeline reshuffle can't quietly
     drop a Home Nation morning blockbuster.

     Fail-closed: a non-integer hour means upstream parsing produced
     garbage — we treat that as malformed data and drop the match.
     ----------------------------------------------------------------------- */
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

  // Rule E — verdict
  const expectedEndMs = kickoffMs + durationMs;
  if (expectedEndMs <= hardCloseMs) return true;

  // High-yield TEN fallback: a single late Tier-1 or knockout match earns
  // its own licence application — but a group-stage match between two
  // non-Tier-1 sides isn't worth the paperwork and is dropped here.
  const isTier1 = TIER_1_TEAMS.includes(team1) || TIER_1_TEAMS.includes(team2);
  if (isTier1 || isKnockout) return true;

  return false;
}

/**
 * Pure projection — returns a fresh data shape with `upcoming` and `england`
 * trimmed to viable matches only. The input data (and the localStorage
 * cache) are never mutated by this function. Non-array values pass through
 * untouched so error / "concluded" payloads keep their shape.
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

// In-flight request deduplication: concurrent callers share one network promise
let pendingPromise = null;

/* -------------------------------------------------------------------------
   SHARED MATCH DATE/TIME FORMATTER
   The 2026 World Cup is hosted in North America, so API `datetimeIso` values
   reference instants that fall hours away from UK wall-clock time. Every
   render surface on this site MUST present Europe/London time regardless of
   the viewer's device timezone (travel, VPN, server-side prerender, etc.).
   Formatter instances are constructed once and reused — `Intl.DateTimeFormat`
   construction is the expensive part; `.format()` is effectively free.
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

/**
 * Long-form weekday of `iso` in Europe/London (e.g. "Saturday").
 * Returns "" for missing/invalid input — string comparison against expected
 * day names then yields false, matching the fail-closed posture of every
 * other classifier in this module. Reuses the pre-allocated London
 * formatter via `readLondonParts`; no new Intl allocations per call.
 */
export function getLondonWeekday(iso) {
  if (!iso) return "";
  const parts = readLondonParts(iso);
  return parts ? parts.weekday : "";
}

/**
 * Single classification authority for "is this a knockout fixture?".
 * Wraps the internal `getStage(match)` + `isKnockoutStage(stage)` pipeline
 * used by the viability rules engine, so UI filter chips and the
 * trading-day rules cannot drift apart on what counts as a knockout.
 */
export function isKnockoutMatch(match) {
  return isKnockoutStage(getStage(match));
}

/**
 * Resolve a team's 3-letter abbreviation for compact list-row rendering.
 * The football-data API exposes `tla` for every World Cup qualifier; this
 * helper degrades gracefully for fallback / anonymous fixtures:
 *   1. Prefer the API-supplied TLA (already uppercase, e.g. "ENG", "BRA")
 *   2. Fall back to the first three letters of the team name, uppercased
 *   3. "TBD" for fully anonymous knockout placeholders
 * Returned strings are always uppercase and never empty.
 */
export function tlaOf(team) {
  const tla = (team?.tla ?? "").trim();
  if (tla) return tla.toUpperCase();
  const name = (team?.name ?? "").trim();
  if (name) return name.slice(0, 3).toUpperCase();
  return "TBD";
}

/**
 * Fetch match data with localStorage fallback.
 * The Worker handles all retry/caching logic; the frontend trusts 200 or falls back.
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

    // Cache BEFORE any read-time enrichment (bookable stamp + viability
    // filter). The persisted blob must remain the RAW API payload: both
    // `isBookable` (a function of "now") and the trading-day filter (a
    // function of "now" + business rules) are recomputed on every read.
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
          // Serve the data gracefully while soft-flagging stale conditions for layout handling
          return filterViableMatches(
            stampBookable({
              ...parsed,
              _source: "local_cache",
              _isOffline: true,
              _isStale: cacheStatus.isStale,
            }),
          );
        } else if (cacheStatus.isAncient) {
          // Purge stale keys to keep timelines free from legacy drift configurations
          localStorage.removeItem(STORAGE_KEY);
          console.warn(
            "MatchData Lib: Purged ancient tournament cache safely from local memory",
          );
        }
      }
    } catch (cacheErr) {
      console.warn(
        "MatchData Lib: Internal cache extraction parser failed",
        cacheErr.message,
      );
    }

    // =========================================================================
    // === LAST RESORT: STATIC FALLBACK DATA INTERCEPT ===
    // This executes only if the network is down AND local memory is non-existent/purged
    // =========================================================================
    console.warn(
      "MatchData Lib: Total cache miss blackout. Serving static fallback matrix.",
    );
    return filterViableMatches(
      stampBookable({
        ...FALLBACK_DATA,
        _isBlackoutActive: true,
        updatedAt: new Date().toISOString(),
      }),
    );
  }
}

/**
 * "Major Tournament Milestones" classifier — R16 through Final + 3rd-place
 * play-off. Group stage + R32 are deliberately excluded: these are the
 * high-yield fixtures we surface at the top of the booking dropdown and
 * use to populate the milestone-curated optgroup. Built on top of
 * `getDetailedStageLabel` so the two stay in lockstep — one label authority.
 */
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
 * Canonical stage-group classifier for the fixtures-page accordion view.
 * Returns a `{ key, label, order }` triplet so the rendering layer can
 * bucket matches into the right accordion, sort buckets in tournament
 * progression order, and display the user-friendly label.
 *
 * Group Stage is sub-divided into Matchdays 1–3 (by London calendar date)
 * so the largest single bucket never holds more than one round of group
 * fixtures (24 games max instead of 72).
 *
 * The `order` field is decoupled from chronology so a UI that wants
 * tournament-order even when a feed mis-sorts matches can rely on it.
 * In practice firstKickoff and order both produce the same sequence.
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
 * Resolves the authoritative tournament phase name.
 * Prioritizes the edge-server's pre-calculated stage metadata, with a
 * defensive Europe/London timezone decoder as a local fallback.
 */
export function getDetailedStageLabel(match) {
  // Path A: Direct server-authoritative mapping pass-through
  if (match?.stageLabel) {
    return match.stageLabel.toUpperCase();
  }

  // Path B: Safe UI fallback layer
  if (!match?.badge || !match.badge.toLowerCase().includes("knockout")) {
    return "Group Stage";
  }
  if (!match.datetimeIso) return "Knockout Stage";

  const date = new Date(match.datetimeIso);
  if (isNaN(date.getTime())) return "Knockout Stage";

  // Use Intl to decode the exact calendar day visible to customers in London
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

  // High-fidelity local calendar safety net
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
