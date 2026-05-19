/* =========================================================================
   MARQUEE CONTROLLER — STATE MACHINE
   Drives the (pure-renderer) marquee component through six discrete
   states based on the current time and the live match-data feed. The
   marquee component itself never makes decisions about what to display
   — it just renders whatever config it is handed.

   States (transitions are deterministic, single-direction with one
   re-evaluation hook on visibilitychange to catch up after a hidden tab
   has missed multiple boundaries):

     A — pre-tournament         · countdown to opener
     B — England upcoming       · known opponent  · "ENG vs BRA IN ..."
     C — England upcoming       · TBD opponent    · "ENG · R16 IN ..."
     D — England live           · no countdown    · "ENG vs BRA · LIVE"
     E — England eliminated     · next headline knockout
     F — Tournament concluded   · static "FULL TIME · 2030"

   The anchor (clickable marquee with chevron) is added for states B/C/E
   when and only when the target match has `isBookable === true`. Past
   the 3-hour booking cutoff, the controller emits a config with no
   `href`, and the marquee renders as plain text — no dead promise.
   ========================================================================= */

import { initMarquee } from "./marquee.js";
import {
  getMatchData,
  getNextEnglandFocus,
  getHeadlineMatches,
  getShortStageLabel,
  isMatchLive,
  isKnockoutMatch,
  tlaOf,
} from "../lib/matchData.js";
import { buildZonesURL } from "../lib/urlHelpers.js";
import { MARQUEE_DEFAULT_STATE, TOURNAMENT_START_ISO } from "../data/content.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const STATE_CONCLUDED = Object.freeze({
  mode: "static",
  text: "FULL TIME · 2030",
});

/**
 * Mount the marquee on `root` and start driving it. Paints the
 * default (pre-tournament) state synchronously so first paint is
 * immediate; then upgrades to the data-driven state once `getMatchData`
 * resolves.
 *
 * Idempotent — re-calling on the same root is a no-op because the
 * underlying marquee component carries its own initialisation gate.
 *
 * @param {HTMLElement} root — element with data-component="marquee"
 */
export function mountMarquee(root) {
  if (!root) return;

  // Sync first paint — uses the static pre-tournament config so the
  // user sees a countdown without waiting on the network.
  const marquee = initMarquee(root, MARQUEE_DEFAULT_STATE);
  if (!marquee) return;

  let matchData = null;
  let transitionTimer = null;

  const clearTransitionTimer = () => {
    if (transitionTimer !== null) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
  };

  const reevaluate = () => {
    clearTransitionTimer();
    const now = Date.now();
    const state = computeState(matchData, now);
    marquee.setState(state);
    scheduleNextTransition(state, matchData, now);
  };

  const scheduleNextTransition = (state, data, now) => {
    const targetMs = nextTransitionAt(state, data, now);
    if (targetMs === null) return; // terminal state, no transition needed

    const delay = targetMs - now;
    if (delay <= 0) {
      // Boundary already passed — re-evaluate on the next microtask
      // so we don't recurse synchronously inside the current call.
      transitionTimer = setTimeout(reevaluate, 0);
      return;
    }

    // Cap at 24 h. Some browsers behave oddly with multi-day setTimeout
    // delays; capping means we wake up once a day and re-arm. Cost is a
    // single no-op tick per day at most — invisible to the user.
    const cappedDelay = Math.min(delay, DAY_MS);
    transitionTimer = setTimeout(reevaluate, cappedDelay);
  };

  // Catch up after the tab was hidden long enough to miss one or more
  // boundaries. Re-evaluating from scratch is cheaper than tracking
  // missed transitions individually.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reevaluate();
  });

  // Data fetch is deduplicated inside matchData.js, so calling it here
  // when app.js / booking.js may also be calling it costs zero extra
  // network — they share one in-flight promise.
  getMatchData()
    .then((data) => {
      matchData = data;
      reevaluate();
    })
    .catch((err) => {
      // Soft failure — the default state remains painted. The marquee
      // stays useful (the opening countdown is still accurate).
      console.warn("MarqueeController: data load failed", err);
    });
}

// =========================================================================
// STATE COMPUTATION
// =========================================================================

/**
 * Pure function — given the current match-data snapshot and `now`,
 * return the marquee config that should be displayed. Returns the
 * static default when data is unavailable; that way the marquee never
 * goes blank.
 */
function computeState(data, now) {
  // F — Tournament concluded (data feed says so OR there's nothing
  // upcoming at all). Highest priority so a "concluded" payload can't
  // accidentally produce a stale countdown.
  if (
    data &&
    (data.status === "concluded" ||
      (Array.isArray(data.upcoming) && data.upcoming.length === 0))
  ) {
    return STATE_CONCLUDED;
  }

  // Pre-tournament — keep the static opener countdown even if data has
  // loaded. The opener IS what we want to count down to until kickoff.
  const tournamentStartMs = Date.parse(TOURNAMENT_START_ISO);
  if (Number.isFinite(tournamentStartMs) && now < tournamentStartMs) {
    return MARQUEE_DEFAULT_STATE;
  }

  // Tournament running. Need data to make any meaningful decision.
  if (!data) return MARQUEE_DEFAULT_STATE;

  // B / C / D — England-led states.
  const englandFocus = getNextEnglandFocus(data, now);
  if (englandFocus) {
    return englandFocus.isLive
      ? makeLiveState(englandFocus.match)
      : makeEnglandCountdownState(englandFocus.match);
  }

  // E — England's tournament is over; surface the next headline
  // knockout instead so the marquee still reflects "what's next at the
  // venue."
  const [nextHeadline] = getHeadlineMatches(data, { limit: 1, now });
  if (nextHeadline) {
    if (isMatchLive(nextHeadline, now)) {
      // Edge case: a non-England knockout is currently underway and is
      // the next headline. Live state mirrors the English variant but
      // labels with the team TLAs.
      return makeHeadlineLiveState(nextHeadline);
    }
    return makeHeadlineCountdownState(nextHeadline);
  }

  // No bookable / viable matches left — treat as concluded.
  return STATE_CONCLUDED;
}

/**
 * When does the current state need to be revisited? Returns the
 * absolute ms timestamp of the next transition, or `null` for terminal
 * states that never transition.
 */
function nextTransitionAt(state, data, now) {
  if (state === STATE_CONCLUDED) return null;

  if (state.mode === "countdown" && state.targetIso) {
    const targetMs = Date.parse(state.targetIso);
    return Number.isNaN(targetMs) ? null : targetMs;
  }

  if (state.mode === "live") {
    // Live state ends at kickoff + duration. Recompute by re-resolving
    // the focus match (we don't carry it in the config to keep marquee
    // configs purely descriptive).
    const focus = getNextEnglandFocus(data, now);
    const liveMatch =
      focus?.isLive && focus.match
        ? focus.match
        : findLiveHeadlineMatch(data, now);
    if (!liveMatch?.datetimeIso) return null;
    const kickoffMs = Date.parse(liveMatch.datetimeIso);
    if (Number.isNaN(kickoffMs)) return null;
    const durationMs = isKnockoutMatch(liveMatch) ? 3 * HOUR_MS : 2 * HOUR_MS;
    return kickoffMs + durationMs;
  }

  return null;
}

function findLiveHeadlineMatch(data, now) {
  const [first] = getHeadlineMatches(data, { limit: 1, now });
  return first && isMatchLive(first, now) ? first : null;
}

// =========================================================================
// STATE CONFIG BUILDERS
// =========================================================================

function makeEnglandCountdownState(match) {
  const opponent = pickOpponent(match);
  const opponentName = (opponent?.name || "").trim();
  const opponentMissing =
    !opponentName || opponentName.toUpperCase() === "TBD";

  const prefix = opponentMissing
    ? `ENG · ${getShortStageLabel(match)} IN` // State C
    : `ENG vs ${tlaOf(opponent)} IN`; // State B

  return withHrefIfBookable(
    { mode: "countdown", targetIso: match.datetimeIso, prefix },
    match,
  );
}

function makeHeadlineCountdownState(match) {
  // State E — England are out; show the next bracket-headline match.
  const prefix = `${getShortStageLabel(match)} IN`;
  return withHrefIfBookable(
    { mode: "countdown", targetIso: match.datetimeIso, prefix },
    match,
  );
}

function makeLiveState(match) {
  // State D — England live. Label uses TLAs to fit the narrow marquee
  // and stays consistent with the upcoming-countdown formatting.
  const opponent = pickOpponent(match);
  const opponentName = (opponent?.name || "").trim();
  const opponentTla =
    opponentName && opponentName.toUpperCase() !== "TBD"
      ? tlaOf(opponent)
      : null;
  const text = opponentTla
    ? `ENG vs ${opponentTla} · LIVE`
    : `ENGLAND · LIVE`;
  return { mode: "live", text };
}

function makeHeadlineLiveState(match) {
  // Same shape as state D but for a non-England headline knockout that
  // happens to be live (e.g. England out, the QF kicks off).
  const aTla = tlaOf(match.teamA);
  const bTla = tlaOf(match.teamB);
  return { mode: "live", text: `${aTla} vs ${bTla} · LIVE` };
}

function withHrefIfBookable(config, match) {
  // Only states B / C / E ever pass through here — and only when the
  // match is genuinely bookable do we expose the anchor. Past the
  // 3-hour cutoff (`isBookable === false`) we drop the href, the
  // marquee renders as plain text, and the dead-promise problem from
  // the audit can never re-emerge.
  if (match?.isBookable !== true) return config;
  let href;
  try {
    href = buildZonesURL(match);
  } catch (e) {
    return config;
  }
  return href ? { ...config, href } : config;
}

function pickOpponent(match) {
  // Returns the non-England side of a match — defends against either
  // ordering of teamA/teamB. Used by every state-builder that has to
  // produce an "ENG vs <opp>" label.
  const aName = (match?.teamA?.name || "").toLowerCase();
  return aName === "england" ? match.teamB : match.teamA;
}
