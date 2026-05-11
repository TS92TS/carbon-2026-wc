/* =========================================================================
   MARQUEE COMPONENT
   Persistent context-aware status bar at the top of every page.
 
   States:
     countdown  → pre-tournament / between matches
     live       → match in progress
     promo      → promotional message (Mill amber)
     post-match → result snapshot
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

  function render() {
    if (config.mode === "countdown" && config.targetIso) {
      const c = countdownTo(config.targetIso);
      if (c.hasPassed) {
        // Auto-transition to live state once kick-off lands
        el.setAttribute("data-state", "live");
        textEl.innerHTML = `<span class="c-marquee__label">${config.liveText || "MATCH UNDERWAY"}</span>`;
        stop();
        return;
      }
      const prefix = config.prefix
        ? `<span class="c-marquee__label">${config.prefix}</span>`
        : "";
      textEl.innerHTML = `${prefix}<span class="c-marquee__num">${formatCountdown(c)}</span>`;
    } else if (config.mode === "live") {
      textEl.innerHTML = `<span class="c-marquee__label">${config.text || "MATCH UNDERWAY"}</span>`;
    } else {
      textEl.innerHTML = `<span class="c-marquee__label">${config.text || ""}</span>`;
    }
  }

  function start() {
    render();
    if (config.mode === "countdown") {
      interval = setInterval(render, TICK_MS);
    }
  }

  function stop() {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
  }

  start();

  // Pause ticker when tab is hidden — saves battery
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) stop();
    else if (config.mode === "countdown") start();
  });

  return { destroy: stop };
}
