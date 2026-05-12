/* =========================================================================
   APP ENTRY · Unified Orchestrator
   ========================================================================= */

import { initMarquee } from "./components/marquee.js";
import { initMobileMenu } from "./components/mobileMenu.js";
import { updateNavStates } from "./lib/navigation.js";
import { getMatchData } from "./lib/matchData.js";
import { renderFeaturedMatch } from "./components/featuredMatch.js";
import { renderUpcomingList } from "./components/upcomingMatches.js";
import { initZoneSliders } from "./components/zoneSlider.js";

const marqueeState = {
  mode: "countdown",
  targetIso: "2026-06-11T20:00:00Z",
  prefix: "Opening Match",
};

async function boot() {
  // 1. UI Initialisation (Must happen before 'await' to prevent lag)
  initMobileMenu();
  updateNavStates();
  initZoneSliders();

  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) initMarquee(marqueeRoot, marqueeState);

  // 2. Data Fetching
  try {
    const data = await getMatchData();
    if (data) {
      renderFeaturedMatch(data);
      renderUpcomingList(data);
    }
  } catch (err) {
    console.warn("App Boot: Data fetch failed, but UI is functional.", err);
  }
}

// Single Entry Point
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}