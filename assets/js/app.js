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

// ---------------------------------------------------------------------------
// Helper: England match booking CTA (move to ./components/booking.js when ready)
// ---------------------------------------------------------------------------
function initBookingCTA(englandMatchData) {
  // TODO: wire to actual booking CTA component
  console.log("Booking CTA initialized for England match:", englandMatchData);
}

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
    // Adapter wrappers: new object API mapped to existing functional imports/DOM
    const featuredMatch = {
      update: (d) => {
        if (featuredCard) renderFeaturedMatch(d);
      },
      renderError: () => {
        if (featuredCard) {
          featuredCard.innerHTML =
            '<p class="match-error">Match data unavailable. Please try again later.</p>';
          featuredCard.classList.add("is-error");
        }
      },
      renderConcluded: () => {
        if (featuredCard) {
          featuredCard.innerHTML =
            '<p class="match-concluded">The season has concluded. See you next season!</p>';
          featuredCard.classList.add("is-concluded");
        }
      },
    };

    const upcomingMatches = {
      update: (d) => {
        if (fixturesList) renderUpcomingList(d);
      },
      hide: () => {
        if (fixturesList) fixturesList.style.display = "none";
      },
    };

    try {
      const data = await getMatchData();

      // 1. Handle Critical Errors (Circuit breaker, network fail, etc.)
      if (!data || data.status === "error") {
        console.error("Match API failed:", data?.error);
        featuredMatch.renderError();
        return;
      }

      // 2. Handle "Season Concluded" state
      if (data.status === "concluded") {
        featuredMatch.renderConcluded();
        upcomingMatches.hide();
        return;
      }

      // 3. Normal Path (Match exists)
      featuredMatch.update(data);
      upcomingMatches.update(data);

      // Check for England matches to trigger booking CTA
      if (data.england && data.england.length > 0) {
        initBookingCTA(data.england[0]);
      }
    } catch (err) {
      console.warn("App: Match data failed to load:", err);
      featuredMatch.renderError();
    }
  }
}

// Single entry point
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
