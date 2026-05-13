// File: matchData.js
const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_match_data_cache";

// In-flight request deduplication: concurrent callers share one network promise
let pendingPromise = null;

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
