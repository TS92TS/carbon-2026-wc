/* =========================================================================
   CONTENT DATA
   Static content blocks consumed by the marquee controller. The
   controller is the single brain — these exports are the inert "before
   we have data" defaults plus the tournament boundary anchor.
   ========================================================================= */

/**
 * Tournament opener kickoff in ISO-8601 with Europe/London (BST, +01:00)
 * offset.
 *   Mexico vs South Africa · Thursday 11 June 2026 · 20:00 UK
 * Drives the pre-tournament countdown AND the state-machine boundary
 * after which the marquee starts tracking the next England fixture.
 * `marqueeController.js` uses this; nothing else should depend on it
 * directly — read `MARQUEE_DEFAULT_STATE.targetIso` if you want the
 * displayed-countdown target.
 */
export const TOURNAMENT_START_ISO = "2026-06-11T20:00:00+01:00";

/**
 * The marquee state painted at first paint (before match data resolves)
 * and whenever `now < TOURNAMENT_START_ISO` regardless of data
 * presence. Once the tournament starts, `marqueeController.js`
 * supersedes this with a data-driven config.
 *
 * Shape mirrors `initMarquee(root, config)` in `components/marquee.js`:
 *   mode      — "countdown" | "live" | "static"
 *   targetIso — ISO timestamp for countdown mode
 *   prefix    — string label rendered before the countdown number
 *   text      — string label for live/static modes
 *   href      — optional anchor target (only in countdown mode)
 */
export const MARQUEE_DEFAULT_STATE = Object.freeze({
  mode: "countdown",
  targetIso: TOURNAMENT_START_ISO,
  prefix: "OPENING MATCH IN",
});
