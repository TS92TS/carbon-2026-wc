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
    const response = await fetch(API_URL, {
      method: "GET",
      mode: "cors", // CRITICAL: This allows the cross-site connection on mobile
      headers: {
        "Accept": "application/json",
        "X-Requested-With": "XMLHttpRequest"
      }
    });

    if (!response.ok) {
      // If the server returns a 500 or 429, try the device backup immediately
      const savedData = localStorage.getItem(STORAGE_KEY);
      if (savedData) {
        renderMatch(JSON.parse(savedData), card);
        return;
      }
      
      const errorData = await response.json();
      throw new Error(errorData.error || "Network response was not ok");
    }

    const nextMatch = await response.json();

    // Success! Save this data for future offline/error use
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextMatch));

    renderMatch(nextMatch, card);

  } catch (error) {
    console.error("Failed to load featured match:", error);
    
    // Check local storage one last time
    const backup = localStorage.getItem(STORAGE_KEY);
    if (backup) {
      renderMatch(JSON.parse(backup), card);
    } else {
      const badge = card.querySelector('[data-match-target="badge"]');
      if (badge) badge.textContent = "Offline";
      card.setAttribute("aria-busy", "false");
    }
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

  // Inject Team A
  card.querySelector('[data-match-target="name-a"]').textContent = data.teamA.name;
  card.querySelector('[data-match-target="flag-a"]').style.backgroundImage = `url('${data.teamA.flag}')`;

  // Inject Team B
  card.querySelector('[data-match-target="name-b"]').textContent = data.teamB.name;
  card.querySelector('[data-match-target="flag-b"]').style.backgroundImage = `url('${data.teamB.flag}')`;

  // Update Badge & Time
  card.querySelector('[data-match-target="badge"]').textContent = data.badge;
  const timeEl = card.querySelector('[data-match-target="time"]');
  timeEl.textContent = `${dateFormatted} · ${timeFormatted}`;
  timeEl.setAttribute("datetime", data.datetimeIso);

  // Reveal Content (Stops the skeleton pulse)
  card.setAttribute("aria-busy", "false");
}
