/* =========================================================================
   APP ENTRY
   Wires components to their DOM roots via data-component attributes.
   ========================================================================= */
 
import { initMarquee } from './components/marquee.js';
import { marqueeState } from './data/content.js';
import { initFeaturedMatch } from './components/featuredMatch.js'; // <-- 1. Import it
 
function boot() {
  const marqueeRoot = document.querySelector('[data-component="marquee"]');
  if (marqueeRoot) initMarquee(marqueeRoot, marqueeState);

  // 2. Run the match fetcher
  initFeaturedMatch(); 
}
 
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}