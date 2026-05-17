// File: matchData.js
const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_match_data_cache";

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
 *   dateShort: string,        // "Thu 11 Jun" — feed rows, dropdown labels
 *   dateLong: string,         // "Thursday 11 June" — sticky date headers
 *   time: string,             // "20:00" — 24h Europe/London
 *   dateInputValue: string,   // "2026-06-11" — populates <input type="date">
 *   iso: string               // pass-through original
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
 * Fetch match data withlocalStorage fallback.
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

async function fetchMatchData() {
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
    console.warn("MatchData Lib: Falling back to local cache", error.message);

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return filterViableMatches(
          stampBookable({
            ...parsed,
            _source: "local_cache",
            _isOffline: true,
          }),
        );
      }
    } catch (cacheErr) {
      console.warn("MatchData Lib: Cache read/parse failed", cacheErr.message);
    }

    return { status: "error", error: error.message, _source: "none" };
  }
}
