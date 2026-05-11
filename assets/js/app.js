/* =========================================================================
   APP ENTRY
   Wires components to their DOM roots via data-component attributes.
   ========================================================================= */

import { initMarquee } from "./components/marquee.js";
import { initMobileMenu } from "./components/mobileMenu.js";
import { marqueeState } from "./data/content.js";
import { getMatchData } from "./lib/matchData.js";
import { renderFeaturedMatch } from "./components/featuredMatch.js";
import { renderUpcomingList } from "./components/upcomingMatches.js";
import { initBottomNav } from './components/bottomNav.js';

async function boot() {
  // Initialize marquee if present
  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) initMarquee(marqueeRoot, marqueeState);

  async function boot() {
    initMobileMenu();
    initBottomNav();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  // Fetch match data once and distribute to components
  try {
    const data = await getMatchData();
    if (data) {
      renderFeaturedMatch(data);
      // Render upcoming list only if the component exists and the function is available
      if (typeof renderUpcomingList === "function") {
        renderUpcomingList(data);
      }
    }
  } catch (err) {
    // Fail gracefully — marquee is already initialized above
    // Log for debugging; UI components should handle missing data themselves
    // eslint-disable-next-line no-console
    console.error("Failed to load match data:", err);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
