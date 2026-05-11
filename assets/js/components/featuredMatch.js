/* =========================================================================
   FEATURED MATCH COMPONENT
   Fetches the next match from our secure Cloudflare proxy with LocalStorage fallback.
   ========================================================================= */

const API_URL = "https://carbon-sports-api.pages.dev/api/get-next-match";
const STORAGE_KEY = "carbon_last_known_match";

export async function initFeaturedMatch() {
  const card = document.getElementById("featured-match");
  if (!card) return;

  try {
    const response = await fetch(API_URL);

    if (!response.ok) {
      // If the API fails (e.g., 522), try to load from LocalStorage backup
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        console.warn("API Error. Serving from LocalStorage fallback.");
        renderMatch(JSON.parse(savedData), card);
        return;
      }
      
      const errorData = await response.json();
      throw new Error(errorData.error || "Network response was not ok");
    }

    const nextMatch = await response.json();

    // Success! Save this data to LocalStorage for future offline/error use
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMatch));

    renderMatch(nextMatch, card);

  } catch (error) {
    console.error("Failed to load featured match:", error);
    
    // Final UI fallback if both API and LocalStorage fail
    const badge = card.querySelector('[data-match-target="badge"]');
    if (badge) badge.textContent = "Offline";
    card.setAttribute("aria-busy", "false");
  }
}

/**
 * Updates the DOM with the match data
 */
function renderMatch(data, card) {
  if (data.status === "concluded") {
    card.innerHTML = '<div class="c-match-card__header">Tournament Concluded</div>';
    card.setAttribute("aria-busy", "false");
    return;
  }

  // 1. Format the date (e.g., "Thu 11 Jun · 20:00")
  const matchDate = new Date(data.datetimeIso);
  const dateFormatted = matchDate.toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeFormatted = matchDate.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });

  // 2. Inject Team A
  card.querySelector('[data-match-target="name-a"]').textContent = data.teamA.name;
  card.querySelector('[data-match-target="flag-a"]').style.backgroundImage = `url('${data.teamA.flag}')`;

  // 3. Inject Team B
  card.querySelector('[data-match-target="name-b"]').textContent = data.teamB.name;
  card.querySelector('[data-match-target="flag-b"]').style.backgroundImage = `url('${data.teamB.flag}')`;

  // 4. Update Badge & Time
  card.querySelector('[data-match-target="badge"]').textContent = data.badge;
  const timeEl = card.querySelector('[data-match-target="time"]');
  timeEl.textContent = `${dateFormatted} · ${timeFormatted}`;
  timeEl.setAttribute("datetime", data.datetimeIso);

  // 5. Reveal Content
  card.setAttribute("aria-busy", "false");
}
