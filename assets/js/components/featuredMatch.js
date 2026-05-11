/* =========================================================================
   FEATURED MATCH COMPONENT
   Fetches the next match from our secure Cloudflare proxy with LocalStorage fallback.
   ========================================================================= */

const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_last_known_match";

/**
 * Fetch the featured match from the proxy, persist to localStorage, and render.
 */
export async function initFeaturedMatch() {
  const card = document.getElementById("featured-match");
  if (!card) return;

  try {
    const response = await fetch(API_URL, {
      method: "GET",
      mode: "cors", // CRITICAL: This allows the cross-site connection on mobile
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    if (!response.ok) {
      // If the server returns a 500 or 429, try the device backup immediately
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        renderFeaturedMatch(JSON.parse(savedData));
        return;
      }

      // Try to parse error body for a clearer message, but fall back gracefully
      let errorData = {};
      try {
        errorData = await response.json();
      } catch (e) {
        /* ignore parse errors */
      }
      throw new Error(errorData.error || "Network response was not ok");
    }

    const nextMatch = await response.json();

    // Success! Save this data for future offline/error use
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMatch));
    } catch (e) {
      // localStorage may be full or unavailable in some contexts; ignore write errors
      console.warn("Could not persist match to localStorage:", e);
    }

    renderFeaturedMatch(nextMatch);
  } catch (error) {
    console.error("Failed to load featured match:", error);

    // Check local storage one last time
    const backup = localStorage.getItem(STORAGE_KEY);
    if (backup) {
      renderFeaturedMatch(JSON.parse(backup));
    } else {
      const badge = card.querySelector('[data-match-target="badge"]');
      if (badge) badge.textContent = "Offline";
      card.setAttribute("aria-busy", "false");
    }
  }
}

/**
 * Updates the DOM with the match data (exported so other modules can reuse it)
 */
export function renderFeaturedMatch(data) {
  const card = document.getElementById("featured-match");
  if (!card || !data) return;

  // Helper to safely access values
  const safe = (v) => (v === undefined || v === null ? "" : v);

  if (data.status === "concluded") {
    card.innerHTML =
      '<div class="c-match-card__header">Tournament Concluded</div>';
    card.setAttribute("aria-busy", "false");
    return;
  }

  const matchDate = new Date(safe(data.datetimeIso));
  const dateFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
  const timeFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

  const badgeEl = card.querySelector('[data-match-target="badge"]');
  const timeEl = card.querySelector('[data-match-target="time"]');
  const nameAEl = card.querySelector('[data-match-target="name-a"]');
  const flagAEl = card.querySelector('[data-match-target="flag-a"]');
  const nameBEl = card.querySelector('[data-match-target="name-b"]');
  const flagBEl = card.querySelector('[data-match-target="flag-b"]');

  if (badgeEl) badgeEl.textContent = safe(data.badge);
  if (timeEl) {
    timeEl.textContent = `${dateFormatted}${dateFormatted && timeFormatted ? " · " : ""}${timeFormatted}`;
    if (safe(data.datetimeIso))
      timeEl.setAttribute("datetime", safe(data.datetimeIso));
  }

  if (nameAEl) nameAEl.textContent = safe(data.teamA && data.teamA.name);
  if (flagAEl)
    flagAEl.style.backgroundImage = safe(data.teamA && data.teamA.flag)
      ? `url('${safe(data.teamA.flag)}')`
      : "";

  if (nameBEl) nameBEl.textContent = safe(data.teamB && data.teamB.name);
  if (flagBEl)
    flagBEl.style.backgroundImage = safe(data.teamB && data.teamB.flag)
      ? `url('${safe(data.teamB.flag)}')`
      : "";

  card.setAttribute("aria-busy", "false");
}
