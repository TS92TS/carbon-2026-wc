/* =========================================================================
   MARQUEE · pure renderer for the persistent status bar. Paints a config
   and re-renders the countdown number on each wall-clock minute boundary.
   State transitions are owned by marqueeController.js.

   API: initMarquee(root, config) → { destroy, setState }
   Config by mode:
     { mode: "countdown", targetIso, prefix, href? }   // href → <a> + chevron
     { mode: "live",      text }
     { mode: "static",    text }
   ========================================================================= */

import { countdownTo, formatCountdown } from "../lib/format.js";

/**
 * @param {HTMLElement} root — element with data-component="marquee"
 * @returns {null | { destroy(): void, setState(newConfig: object): void }}
 */
export function initMarquee(root, config) {
  if (!root || !config) return null;

  // Idempotency gate — stops a re-bootstrap stacking duplicate timers /
  // visibilitychange listeners on the same root.
  if (root.dataset.marqueeInitialized === "true") return null;
  root.dataset.marqueeInitialized = "true";

  const el = document.createElement("div");
  el.className = "c-marquee";
  el.setAttribute("aria-live", "polite");
  root.replaceChildren(el);

  let activeConfig = config;
  let numEl = null; // set by paintShell only in countdown mode
  let timer = null;

  // Pause the tick when hidden; re-evaluate + resume on return. Bound
  // once even in live/static modes so a later setState→countdown works.
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
    /** Replace the config and repaint; restart the tick if the new mode
     *  warrants one. Called by marqueeController.js on each transition. */
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

  // ---- internal helpers ----

  /** Rebuild the inner DOM from `activeConfig`. Fires only on init +
   *  transitions; the per-minute tick just updates numEl.textContent. */
  function paintShell() {
    el.setAttribute("data-state", activeConfig.mode);
    el.replaceChildren();

    const dot = document.createElement("span");
    dot.className = "c-marquee__dot";
    dot.setAttribute("aria-hidden", "true");
    el.appendChild(dot);

    if (activeConfig.mode === "countdown") {
      // Prefix label + countdown number, wrapped in an anchor + chevron
      // when `href` is supplied.
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
      // Paint synchronously so there's no empty-number frame before the
      // first tick.
      const initial = countdownTo(activeConfig.targetIso);
      numEl.textContent = initial.hasPassed ? "" : formatCountdown(initial);
      text.appendChild(numEl);

      if (isLink) text.appendChild(createChevronSVG());

      el.appendChild(text);
      return;
    }

    // Live + static: a labelled text block. data-state drives the dot
    // styling (red pulse for live, dim for static).
    numEl = null;
    const text = document.createElement("span");
    text.className = "c-marquee__text";
    const label = document.createElement("span");
    label.className = "c-marquee__label";
    label.textContent = activeConfig.text || "";
    text.appendChild(label);
    el.appendChild(text);
  }

  // +50ms so we land just past the boundary, not just before it.
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
      // Stop ticking — the controller's transition timer fires at this
      // same moment and will setState into the next state.
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

/** Trailing chevron for the anchor variant — same path as the
 *  fixture-row arrow for a consistent "tappable" cue. */
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