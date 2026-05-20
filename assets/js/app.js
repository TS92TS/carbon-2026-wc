/* =========================================================================
   APP ENTRY · boot orchestrator. Mounts always-on shell, then page-
   specific components and the match-data fetch only where markers exist.
   ========================================================================= */

import { mountMarquee } from "./components/marqueeController.js";
import { initMobileMenu } from "./components/mobileMenu.js";
import { updateNavStates } from "./lib/navigation.js";
import { getMatchData } from "./lib/matchData.js";
import { renderFeaturedMatch } from "./components/featuredMatch.js";
import { renderUpcomingList } from "./components/upcomingMatches.js";
import { initFixturesPage } from "./components/fixturesPage.js";
import { initZoneSliders } from "./components/zoneSlider.js";
import { initZonesPage } from "./components/zonesPage.js";
import { initScrollVideos } from "./lib/video.js";
import { initBookingConcierge } from "./components/booking.js";
import { consumeFunnelHint } from "./lib/funnelHint.js";

async function boot() {
  // ---- shell · always on ----
  initMobileMenu();
  updateNavStates();
  consumeFunnelHint(); // surfaces + clears any book.html gate redirect hint

  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) mountMarquee(marqueeRoot);

  // ---- page-specific · only when the marker is present ----
  if (document.querySelector('[data-component="zone-slider"]')) {
    initZoneSliders();
  }

  if (document.querySelector('[data-component="fixture-banner"]')) {
    initZonesPage();
  }

  if (document.querySelector('[data-component="scroll-video"]')) {
    initScrollVideos();
  }

  if (document.getElementById("booking-form")) {
    // Fire-and-forget; the .catch nets any throw outside the function's
    // own try/catch so it never becomes an unhandled rejection.
    initBookingConcierge().catch((err) =>
      console.warn("App: Booking init failed:", err),
    );
  }

  // ---- data · fetch only on pages that render fixtures ----
  const featuredCard = document.getElementById("featured-match");
  const fixturesList = document.getElementById("upcoming-fixtures-list");
  const fullFixtures = document.getElementById("fixtures-list");

  if (featuredCard || fixturesList || fullFixtures) {
    // Error / concluded states render a centered caption and clear
    // aria-busy so SR stops announcing "loading".
    const featuredMatch = {
      update: (d) => {
        if (featuredCard) renderFeaturedMatch(d);
      },
      renderError: () => {
        if (featuredCard) {
          featuredCard.innerHTML =
            '<p class="u-caption" style="text-align:center;padding:var(--space-4) 0">Match data unavailable. Please try again later.</p>';
          featuredCard.setAttribute("aria-busy", "false");
        }
      },
      renderConcluded: () => {
        if (featuredCard) {
          featuredCard.innerHTML =
            '<p class="u-caption" style="text-align:center;padding:var(--space-4) 0">The season has concluded. See you next season!</p>';
          featuredCard.setAttribute("aria-busy", "false");
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

      if (!data || data.status === "error") {
        console.error("Match API failed:", data?.error);
        featuredMatch.renderError();
        return;
      }

      if (data.status === "concluded") {
        featuredMatch.renderConcluded();
        upcomingMatches.hide();
        if (fullFixtures) {
          fullFixtures.innerHTML =
            '<p class="u-caption" style="text-align:center;padding:var(--space-12)">The tournament has concluded. See you next season!</p>';
          fullFixtures.setAttribute("aria-busy", "false");
        }
        return;
      }

      featuredMatch.update(data);
      upcomingMatches.update(data);
      if (fullFixtures) initFixturesPage(data);
    } catch (err) {
      console.warn("App: Match data failed to load:", err);
      featuredMatch.renderError();
    }
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot);
} else {
  boot();
}
