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
import { initScrollVideos } from "./lib/video.js";
import { initBookingConcierge } from "./components/booking.js";
import { marqueeState } from "./data/content.js";
 
async function boot() {
  // ---- 1. SHELL · always-on UI ------------------------------------------
  initMobileMenu();
  updateNavStates();
 
  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) initMarquee(marqueeRoot, marqueeState);
 
  // ---- 2. PAGE-SPECIFIC · only run if the page has markers --------------
  if (document.querySelector('[data-component="zone-slider"]')) {
    initZoneSliders();
  }
 
  if (document.querySelector('[data-component="scroll-video"]')) {
    initScrollVideos();
  }
 
  if (document.getElementById("booking-form")) {
    initBookingConcierge();
  }
 
  // ---- 3. DATA · only fetch on pages that need it -----------------------
  const featuredCard = document.getElementById("featured-match");
  const fixturesList = document.getElementById("upcoming-fixtures-list");
 
  if (featuredCard || fixturesList) {
    try {
      const data = await getMatchData();
      if (data) {
        if (featuredCard) renderFeaturedMatch(data);
        if (fixturesList) renderUpcomingList(data);
      }
    } catch (err) {
      console.warn("App: Match data failed to load:", err);
    }
  }
}
 
// Single entry point
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}