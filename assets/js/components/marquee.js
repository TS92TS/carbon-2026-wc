/* =========================================================================
   MARQUEE COMPONENT
   Persistent status bar at the top of every page.
   Self-terminating "set-and-forget" system: a chained setTimeout re-syncs
   to the next wall-clock minute boundary on every render, so the countdown
   ticks exactly when the displayed minute changes (not 60× per minute as a
   1s setInterval would). When the target passes, the marquee flips to its
   live state and tears down both the timer and its visibilitychange hook.
   ========================================================================= */

import { countdownTo, formatCountdown } from "../lib/format.js";

/**
 * Initialise the marquee.
 * @param {HTMLElement} root — element with data-component="marquee"
 * @param {object} config — marquee state object (see content.js for shape)
 */
export function initMarquee(root, config) {
  if (!root || !config) return null;

  // === THE IDEMPOTENCY GATE ===
  // Intercepts redundant re-initialization calls and protects active runtimes
  if (root.dataset.marqueeInitialized === "true") return null;
  root.dataset.marqueeInitialized = "true";

  const el = document.createElement("div");
  el.className = "c-marquee";
  el.setAttribute("data-state", config.mode);
  el.setAttribute("aria-live", "polite");
  el.innerHTML = `
    <span class="c-marquee__dot" aria-hidden="true"></span>
    <span class="c-marquee__text"></span>
  `;
  root.replaceChildren(el);

  const textEl = el.querySelector(".c-marquee__text");
  let timer = null;

  // Explicitly declared listener allocation allowing for total memory detachment
  const onVisibilityChange = () => {
    if (document.hidden) {
      stop();
    } else if (config.mode === "countdown") {
      start();
    }
  };

  /**
   * Paints the current marquee state.
   * @returns {boolean} true if the marquee should keep ticking (countdown
   *   still active); false if it has self-terminated or is in a static mode
   *   that needs no further updates.
   */
  function render() {
    if (config.mode === "countdown" && config.targetIso) {
      const c = countdownTo(config.targetIso);

      if (c.hasPassed) {
        // Permanent visual transition to live tournament colour language
        el.setAttribute("data-state", "live");
        textEl.innerHTML = `<span class="c-marquee__label">${config.liveText || "TOURNAMENT UNDERWAY"}</span>`;

        // Airtight self-termination — halt scheduling AND drop the global
        // visibilitychange hook so nothing can re-arm the marquee later.
        stop();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        return false;
      }

      const prefix = config.prefix
        ? `<span class="c-marquee__label">${config.prefix}</span>`
        : "";
      textEl.innerHTML = `${prefix}<span class="c-marquee__num">${formatCountdown(c)}</span>`;
      return true;
    }

    // Static modes (promo / live / post-match) — paint once, no ticking.
    const fallbackText =
      config.text || config.liveText || "TOURNAMENT UNDERWAY";
    textEl.innerHTML = `<span class="c-marquee__label">${fallbackText}</span>`;
    return false;
  }

  /**
   * Milliseconds until the next wall-clock minute boundary.
   * +50ms safety so we land just past the boundary instead of just before
   * it (cheap insurance against the floor calculation drifting one tick
   * early under load).
   */
  function msUntilNextMinute() {
    return 60000 - (Date.now() % 60000) + 50;
  }

  function tick() {
    const keepGoing = render();
    timer = keepGoing ? setTimeout(tick, msUntilNextMinute()) : null;
  }

  function start() {
    if (timer !== null) return; // already scheduled
    tick();
  }

  function stop() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  // Engage execution cycle
  start();

  // Attach global passive browser listener hooks only if active ticking is required
  if (config.mode === "countdown") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }

  return {
    destroy: () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      root.removeAttribute("data-marquee-initialized");
    },
  };
}
