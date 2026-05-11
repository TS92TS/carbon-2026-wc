/* =========================================================================
   APP ENTRY · Unified Orchestrator
   ========================================================================= */

import { initMarquee } from "./components/marquee.js";
import { initMobileMenu } from "./components/mobileMenu.js";
import { updateNavStates } from "./lib/navigation.js";
import { getMatchData } from "./lib/matchData.js";
import { renderFeaturedMatch } from "./components/featuredMatch.js";
import { renderUpcomingList } from "./components/upcomingMatches.js";

// Note: Ensure marqueeState is either imported or defined locally
const marqueeState = {
    mode: 'countdown',
    targetIso: '2026-06-11T20:00:00Z', // Opening Match
    prefix: 'Opening Match'
};

async function boot() {
  console.log("App: Booting...");

  // 1. Initialize UI Interactions (Immediate)
  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) {
    initMarquee(marqueeRoot, marqueeState);
  }

  initMobileMenu();   // Initialize hamburger toggle
  updateNavStates();  // Highlight active links in both menus

  // 2. Fetch and Render Match Data (Asynchronous)
  try {
    const data = await getMatchData();
    if (data) {
      renderFeaturedMatch(data);
      renderUpcomingList(data);
    }
  } catch (err) {
    console.error("App: Match data failed to load:", err);
  }
}

// Single entry point
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}