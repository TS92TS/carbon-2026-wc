/* =========================================================================
   CONTENT DATA · inert defaults for the marquee controller (the brain).
   ========================================================================= */

/* Tournament opener, Europe/London (BST = +01:00):
   Mexico vs South Africa · Thu 11 Jun 2026 · 20:00 UK.
   Drives the pre-tournament countdown AND the state-machine boundary
   after which the marquee starts tracking the next England fixture. */
export const TOURNAMENT_START_ISO = "2026-06-11T20:00:00+01:00";

/* Marquee config at first paint and whenever now < TOURNAMENT_START_ISO.
   Shape mirrors initMarquee(root, config) in components/marquee.js. */
export const MARQUEE_DEFAULT_STATE = Object.freeze({
  mode: "countdown",
  targetIso: TOURNAMENT_START_ISO,
  prefix: "OPENING MATCH IN",
});
