/* =========================================================================
   HERO REEL · Crossfades curated frames over the static hero background.
   Progressive enhancement — the base hero image is the LCP and renders
   identically without JS. Frame images load only after the page is idle, so
   the critical path is untouched. Bails under prefers-reduced-data or
   prefers-reduced-motion; pauses while the tab is hidden.
   ========================================================================= */

const HOLD_MS = 3000;
const FADE_MS = 1500; // mirror the CSS opacity transition on .c-hero__reel-frame

export function initHeroReel() {
  const reel = document.querySelector('[data-component="hero-reel"]');
  if (!reel) return;

  const reducedData = window.matchMedia("(prefers-reduced-data: reduce)").matches;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedData || reducedMotion) return;

  const frames = Array.from(reel.querySelectorAll("[data-reel-src]"));
  if (!frames.length) return;

  const whenIdle = window.requestIdleCallback || ((cb) => window.setTimeout(cb, 200));

  // Defer frame downloads until the browser is idle (post-LCP), then decode
  // off-thread before the first fade so the crossfade never janks.
  whenIdle(() => {
    Promise.all(
      frames.map((frame) => {
        const src = frame.getAttribute("data-reel-src");
        const img = new Image();
        img.src = src;
        const ready = img.decode ? img.decode() : Promise.resolve();
        return ready.catch(() => {}).then(() => {
          frame.style.backgroundImage = `url("${src}")`;
        });
      }),
    ).then(startCycle);
  });

  function startCycle() {
    // Cycle states: 0 = base image (no frame visible), 1..N = each frame.
    const states = frames.length + 1;
    let index = 0;
    let timer = null;

    const advance = () => {
      index = (index + 1) % states;
      frames.forEach((frame, i) => frame.classList.toggle("is-visible", i === index - 1));
    };

    const play = () => {
      if (!timer) timer = window.setInterval(advance, HOLD_MS + FADE_MS);
    };

    const pause = () => {
      window.clearInterval(timer);
      timer = null;
    };

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) pause();
      else play();
    });

    if (!document.hidden) play();
  }
}
