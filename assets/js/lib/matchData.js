// File: matchData.js
const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_match_data_cache";

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

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(enrichedData));
    } catch (storageErr) {
      console.warn("MatchData Lib: Failed to write cache", storageErr.message);
    }

    return enrichedData;
  } catch (error) {
    console.warn("MatchData Lib: Falling back to local cache", error.message);

    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        return { ...parsed, _source: "local_cache", _isOffline: true };
      }
    } catch (cacheErr) {
      console.warn("MatchData Lib: Cache read/parse failed", cacheErr.message);
    }

    return { status: "error", error: error.message, _source: "none" };
  }
}
