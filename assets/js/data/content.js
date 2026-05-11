/* =========================================================================
   CONTENT DATA
   Static content blocks. Replaced by dynamic data later.
   ========================================================================= */
 
/**
 * Marquee state.
 * mode: 'countdown' | 'live' | 'promo' | 'post-match'
 *
 *  - countdown: requires `targetIso` and `prefix`
 *  - live:      requires `text` (e.g. "ENG 2-1 BRA · 67'")
 *  - promo:     requires `text`
 *  - post-match:requires `text` (e.g. "FT · ENG 2-1 BRA — book the next one")
 */
export const marqueeState = {
  mode: 'countdown',
  targetIso: '2026-06-11T20:00:00+01:00',   // 2026 opener kick-off
  prefix: 'OPENS IN',
  liveText: 'MATCH UNDERWAY · TAP FOR LIVE'
};


 