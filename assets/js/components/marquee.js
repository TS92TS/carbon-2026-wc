/* =========================================================================    MARQUEE COMPONENT — PURE RENDERER
   Persistent status bar at the top of every page. Pure presentation: takes
   a config (mode + label + optional countdown target + optional href),
   paints it, and re-renders the countdown number on each wall-clock minute
   boundary. State transitions (pre-tournament → England countdown → live →
   etc.) are owned by marqueeController.js — this component just renders
   what it's told.

   Public API:
     initMarquee(root, config) → { destroy, setState }

   Config shapes by mode:
     { mode: "countdown", targetIso, prefix, href? }
     { mode: "live",      text }
     { mode: "static",    text }

   When `href` is present in countdown mode, the text block becomes an <a>
   with a trailing chevron icon — used for upcoming-fixture states whose
   target match is bookable. Past the booking cutoff the controller
   simply drops `href` from the config and the tap affordance disappears.
   ========================================================================= */

import { countdownTo, formatCountdown } from "../lib/format.js";

/**
 * Initialise the marquee.
 * @param {HTMLElement} root — element with data-component="marquee"
 * @param {object} config — see shapes above
 * @returns {null | { destroy(): void, setState(newConfig: object): void }}
 */
export function initMarquee(root, config) {
  if (!root || !config) return null;

  // === THE IDEMPOTENCY GATE ===
  // Intercepts redundant re-initialisation calls so a re-bootstrap (HMR,
  // late hydration, hypothetical test harness) can't stack duplicate
  // timers or visibilitychange listeners on the same root.
  if (root.dataset.marqueeInitialized === "true") return null;
  root.dataset.marqueeInitialized = "true";

  const el = document.createElement("div");
  el.className = "c-marquee";
  el.setAttribute("aria-live", "polite");
  root.replaceChildren(el);

  let activeConfig = config;
  let numEl = null; // populated by paintShell when mode === "countdown"
  let timer = null;

  /**
   * On visibility hide we stop the timer; on visibility return we
   * re-evaluate the countdown immediately and resume. Static / live
   * modes have no timer to pause but we still bind once so a future
   * setState into countdown mode picks up the hook automatically.
   */
  const onVisibilityChange = () => {
    if (document.hidden) {
      stop();
    } else if (activeConfig.mode === "countdown" && activeConfig.targetIso) {
      start();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  paintShell();
  if (activeConfig.mode === "countdown" && activeConfig.targetIso) start();

  return {
    destroy() {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.removeAttribute("data-marquee-initialized");
    },
    /**
     * Replace the config and repaint. Tears down the current minute-tick
     * (if any) and starts a fresh one if the new mode warrants it.
     * Called by marqueeController.js on every state transition.
     */
    setState(newConfig) {
      if (!newConfig) return;
      stop();
      activeConfig = newConfig;
      paintShell();
      if (activeConfig.mode === "countdown" && activeConfig.targetIso) {
        start();
      }
    },
  };

  // -------------------------------------------------------------------------
  // INTERNAL HELPERS
  // -------------------------------------------------------------------------

  /**
   * Rebuild the marquee's inner DOM from scratch using `activeConfig`.
   * Cheap (<10 nodes) and only fires on init + state transitions, never
   * on the per-minute tick. The minute tick only updates `numEl.textContent`.
   */
  function paintShell() {
    el.setAttribute("data-state", activeConfig.mode);
    el.replaceChildren();

    const dot = document.createElement("span");
    dot.className = "c-marquee__dot";
    dot.setAttribute("aria-hidden", "true");
    el.appendChild(dot);

    if (activeConfig.mode === "countdown") {
      // Countdown: prefix label + countdown number, optionally wrapped in
      // an anchor with a trailing chevron when `href` is supplied.
      const isLink = Boolean(activeConfig.href);
      const text = document.createElement(isLink ? "a" : "span");
      text.className = isLink
        ? "c-marquee__text c-marquee__text--link"
        : "c-marquee__text";
      if (isLink) text.setAttribute("href", activeConfig.href);

      if (activeConfig.prefix) {
        const label = document.createElement("span");
        label.className = "c-marquee__label";
        label.textContent = activeConfig.prefix;
        text.appendChild(label);
      }

      numEl = document.createElement("span");
      numEl.className = "c-marquee__num";
      // Paint the initial value synchronously so the user never sees an
      // empty number frame between paintShell and the first tick.
      const initial = countdownTo(activeConfig.targetIso);
      numEl.textContent = initial.hasPassed ? "" : formatCountdown(initial);
      text.appendChild(numEl);

      if (isLink) text.appendChild(createChevronSVG());

      el.appendChild(text);
      return;
    }

    // Live + static modes share the same DOM shape — just a labelled
    // text block. The data-state attribute on `.c-marquee` drives the
    // dot styling (red pulse for live, dim for static).
    numEl = null;
    const text = document.createElement("span");
    text.className = "c-marquee__text";
    const label = document.createElement("span");
    label.className = "c-marquee__label";
    label.textContent = activeConfig.text || "";
    text.appendChild(label);
    el.appendChild(text);
  }

  /**
   * Milliseconds until the next wall-clock minute boundary. +50 ms
   * safety so we land just past the boundary instead of just before it.
   */
  function msUntilNextMinute() {
    return 60000 - (Date.now() % 60000) + 50;
  }

  function tick() {
    if (!numEl || !activeConfig.targetIso) {
      timer = null;
      return;
    }
    const c = countdownTo(activeConfig.targetIso);
    if (c.hasPassed) {
      // Target reached. Stop the tick — the controller has its own
      // transition timer scheduled for this exact moment which will call
      // setState with the next state's config any millisecond now.
      timer = null;
      return;
    }
    numEl.textContent = formatCountdown(c);
    timer = setTimeout(tick, msUntilNextMinute());
  }

  function start() {
    if (timer !== null) return;
    tick();
  }

  function stop() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }
}

/**
 * The trailing chevron rendered after the countdown number when the
 * marquee is wrapped in an anchor. Same path data + visual weight as
 * the fixture-row arrow so the affordance reads as one consistent "this
 * is tappable, leads to a fixture" cue across the site.
 */
function createChevronSVG() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("class", "c-marquee__chevron");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2.5");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("d", "M9 18l6-6-6-6");
  svg.appendChild(path);
  return svg;
}