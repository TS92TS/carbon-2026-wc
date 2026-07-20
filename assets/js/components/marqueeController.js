/* =========================================================================
   MARQUEE CONTROLLER · state machine driving the pure-renderer marquee
   from the clock + live match feed. One re-evaluation hook on
   visibilitychange catches up a hidden tab that missed boundaries.

     A — pre-tournament       · countdown to opener
     B — England upcoming     · known opponent  · "ENG vs BRA IN …"
     C — England upcoming     · TBD opponent    · "ENG · R16 IN …"
     D — England live         · "ENG vs BRA · LIVE"
     E — England eliminated   · next headline knockout
     F — concluded            · static "FULL TIME · 2030"

   States B/C/E get the clickable anchor only when the target match is
   bookable; past the cutoff the href is dropped (no dead promise).
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
  text: "FULL TIME · SEE YOU SOON",
});

/**
 * Mount the marquee and drive it. Paints the pre-tournament default
 * synchronously, then upgrades to the data-driven state once match data
 * resolves. Idempotent via the marquee component's own init gate.
 */
export function mountMarquee(root) {
  if (!root) return;

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

  // Re-evaluate from scratch on tab return — catches up any missed
  // boundaries without tracking them individually.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reevaluate();
  });

  // getMatchData dedupes its in-flight promise, so this shares the
  // fetch app.js / booking.js may also trigger — zero extra network.
  getMatchData()
    .then((data) => {
      matchData = data;
      reevaluate();
    })
    .catch((err) => {
      // Soft failure — the default state stays painted and useful.
      console.warn("MarqueeController: data load failed", err);
    });
}

/* ---- state computation ---- */

/**
 * Pure: given a match-data snapshot + `now`, return the marquee config
 * to display. Falls back to the static default so it never goes blank.
 */
function computeState(data, now) {
  // F — concluded (feed says so, or nothing upcoming). Highest priority
  // so a concluded payload can't produce a stale countdown.
  if (
    data &&
    (data.status === "concluded" ||
      (Array.isArray(data.upcoming) && data.upcoming.length === 0))
  ) {
    return STATE_CONCLUDED;
  }

  // A — pre-tournament. Keep the opener countdown even after data loads.
  const tournamentStartMs = Date.parse(TOURNAMENT_START_ISO);
  if (Number.isFinite(tournamentStartMs) && now < tournamentStartMs) {
    return MARQUEE_DEFAULT_STATE;
  }

  if (!data) return MARQUEE_DEFAULT_STATE;

  // B / C / D — England-led.
  const englandFocus = getNextEnglandFocus(data, now);
  if (englandFocus) {
    return englandFocus.isLive
      ? makeLiveState(englandFocus.match)
      : makeEnglandCountdownState(englandFocus.match);
  }

  // E — England out: surface the next headline knockout.
  const [nextHeadline] = getHeadlineMatches(data, { limit: 1, now });
  if (nextHeadline) {
    return isMatchLive(nextHeadline, now)
      ? makeHeadlineLiveState(nextHeadline)
      : makeHeadlineCountdownState(nextHeadline);
  }

  return STATE_CONCLUDED;
}

/**
 * Absolute ms timestamp the current state should be revisited at, or
 * `null` for terminal states.
 */
function nextTransitionAt(state, data, now) {
  if (state === STATE_CONCLUDED) return null;

  if (state.mode === "countdown" && state.targetIso) {
    const targetMs = Date.parse(state.targetIso);
    return Number.isNaN(targetMs) ? null : targetMs;
  }

  if (state.mode === "live") {
    // Live ends at kickoff + duration. Re-resolve the focus match since
    // configs stay purely descriptive (no match ref carried).
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

/* ---- state config builders ---- */

function makeEnglandCountdownState(match) {
  const opponent = pickOpponent(match);
  const opponentName = (opponent?.name || "").trim();
  const opponentMissing =
    !opponentName || opponentName.toUpperCase() === "TBD";

  const prefix = opponentMissing
    ? `ENG · ${getShortStageLabel(match)} IN` // C: TBD opponent
    : `ENG vs ${tlaOf(opponent)} IN`; // B: known opponent

  return withHrefIfBookable(
    { mode: "countdown", targetIso: match.datetimeIso, prefix },
    match,
  );
}

function makeHeadlineCountdownState(match) {
  const prefix = `${getShortStageLabel(match)} IN`;
  return withHrefIfBookable(
    { mode: "countdown", targetIso: match.datetimeIso, prefix },
    match,
  );
}

function makeLiveState(match) {
  // TLAs to fit the narrow marquee, consistent with countdown formatting.
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
  const aTla = tlaOf(match.teamA);
  const bTla = tlaOf(match.teamB);
  return { mode: "live", text: `${aTla} vs ${bTla} · LIVE` };
}

/** Adds the booking anchor only when the match is bookable; past the
 *  cutoff the marquee renders as plain text. */
function withHrefIfBookable(config, match) {
  if (match?.isBookable !== true) return config;
  let href;
  try {
    href = buildZonesURL(match);
  } catch (e) {
    return config;
  }
  return href ? { ...config, href } : config;
}

/** Non-England side of a match (defends against either team ordering). */
function pickOpponent(match) {
  const aName = (match?.teamA?.name || "").toLowerCase();
  return aName === "england" ? match.teamB : match.teamA;
}
