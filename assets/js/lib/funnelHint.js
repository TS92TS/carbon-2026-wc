/* =========================================================================
   FUNNEL HINT · reads + clears the contextual message booking.js stashes
   in sessionStorage before a gate redirect, then renders it into
   `#funnel-hint`. Consume-once-then-forget so the message can't surface
   on an unrelated later navigation.
   ========================================================================= */

const HINT_SESSION_KEY = "carbon_funnel_redirect_hint";
const AUTO_DISMISS_MS = 8000;

export function consumeFunnelHint() {
  let message = null;
  try {
    message = sessionStorage.getItem(HINT_SESSION_KEY);
    // Clear before display so a downstream throw can't leave the hint
    // armed for re-surfacing on the next page.
    if (message) sessionStorage.removeItem(HINT_SESSION_KEY);
  } catch (e) {
    return;
  }
  if (!message) return;

  const el = document.getElementById("funnel-hint");
  if (!el) return;

  const textEl = el.querySelector(".c-funnel-hint__text");
  const dismissBtn = el.querySelector(".c-funnel-hint__dismiss");

  // textContent locks the boundary so a future refactor that pipes
  // user-derived content through here can't open an XSS vector.
  if (textEl) textEl.textContent = message;
  el.removeAttribute("hidden");

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    el.setAttribute("hidden", "");
  };

  if (dismissBtn) {
    dismissBtn.addEventListener("click", dismiss, { once: true });
  }

  setTimeout(dismiss, AUTO_DISMISS_MS);
}
