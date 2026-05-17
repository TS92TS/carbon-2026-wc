/* =========================================================================
   MARQUEE COMPONENT
   Persistent status bar at the top of every page.
   Optimized into an independent, self-terminating "Set-and-Forget" system.
   ========================================================================= */

import { countdownTo, formatCountdown } from "../lib/format.js";

const TICK_MS = 1000;

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
  let interval = null;

  // Explicitly declared listener allocation allowing for total memory detachment
  const onVisibilityChange = () => {
    if (document.hidden) {
      stop();
    } else if (config.mode === "countdown") {
      start();
    }
  };

  function render() {
    if (config.mode === "countdown" && config.targetIso) {
      const c = countdownTo(config.targetIso);

      if (c.hasPassed) {
        // 1. Force permanent visual transition to live tournament color rule language
        el.setAttribute("data-state", "live");

        // 2. Set static, un-maintained milestone string layout anchor
        textEl.innerHTML = `<span class="c-marquee__label">${config.liveText || "TOURNAMENT UNDERWAY"}</span>`;

        // 3. AIRTIGHT SELF-TERMINATION CLEANUP
        // Halts clock execution and detaches global event listener scopes completely
        stop();
        document.removeEventListener("visibilitychange", onVisibilityChange);
        return;
      }

      const prefix = config.prefix
        ? `<span class="c-marquee__label">${config.prefix}</span>`
        : "";
      textEl.innerHTML = `${prefix}<span class="c-marquee__num">${formatCountdown(c)}</span>`;
    } else {
      // Direct pass-through path for static operations mode
      const fallbackText =
        config.text || config.liveText || "TOURNAMENT UNDERWAY";
      textEl.innerHTML = `<span class="c-marquee__label">${fallbackText}</span>`;
    }
  }

  function start() {
    render();
    if (config.mode === "countdown" && !interval) {
      interval = setInterval(render, TICK_MS);
    }
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
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
