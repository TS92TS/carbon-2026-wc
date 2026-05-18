/* =========================================================================
   APP ENTRY · Unified Orchestrator
   ========================================================================= */

import { initMarquee } from "./components/marquee.js";
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
import { marqueeState } from "./data/content.js";

async function boot() {
  // ---- 1. SHELL · always-on UI ------------------------------------------
  initMobileMenu();
  updateNavStates();

  // Surface (and clear) any redirect hint left behind by the book.html
  // gate. Bails silently on pages without a #funnel-hint element or
  // when sessionStorage holds no hint.
  consumeFunnelHint();

  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) initMarquee(marqueeRoot, marqueeState);

  // ---- 2. PAGE-SPECIFIC · only run if the page has markers --------------
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
    // Fire-and-forget by design — booking init runs in parallel with the
    // data-fetch branch below. The `.catch` is a safety net for any
    // exception thrown OUTSIDE the function's internal try/catch (a future
    // submit-handler bug, a synchronous throw before the try block, etc.)
    // so it never surfaces as an unhandled Promise rejection.
    initBookingConcierge().catch((err) =>
      console.warn("App: Booking init failed:", err),
    );
  }

  // ---- 3. DATA · only fetch on pages that need it -----------------------
  const featuredCard = document.getElementById("featured-match");
  const fixturesList = document.getElementById("upcoming-fixtures-list");
  const fullFixtures = document.getElementById("fixtures-list");

  if (featuredCard || fixturesList || fullFixtures) {
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
        if (fullFixtures) {
          fullFixtures.innerHTML =
            '<p class="u-caption" style="text-align:center;padding:var(--space-12)">The tournament has concluded. See you next season!</p>';
          fullFixtures.setAttribute("aria-busy", "false");
        }
        return;
      }

      // 3. Normal Path (Match exists)
      featuredMatch.update(data);
      upcomingMatches.update(data);
      if (fullFixtures) initFixturesPage(data);
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
