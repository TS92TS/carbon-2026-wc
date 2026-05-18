/* =========================================================================
   FUNNEL HINT CONSUMER
   The book.html gate writes a contextual hint string to sessionStorage
   immediately before redirecting (see `redirectToFunnel` in booking.js).
   This module reads + CLEARS the hint on the destination page and
   surfaces it via the `#funnel-hint` element.

   Clear-on-read is essential: without it, the hint would persist across
   unrelated navigations and surface out-of-context on the next page that
   has the element. The pattern is "consume once, then forget."

   The element is auto-dismissed after a short window so it doesn't linger
   once the user has had time to read it. Click-to-dismiss is also wired
   for users who want it gone immediately.
   ========================================================================= */

const HINT_SESSION_KEY = "carbon_funnel_redirect_hint";
const AUTO_DISMISS_MS = 8000;

export function consumeFunnelHint() {
  let message = null;
  try {
    message = sessionStorage.getItem(HINT_SESSION_KEY);
    // Consume — clear immediately so re-renders / page transitions can't
    // re-surface a stale hint. Removal happens BEFORE display logic so
    // even if downstream code throws, the hint won't loop.
    if (message) sessionStorage.removeItem(HINT_SESSION_KEY);
  } catch (e) {
    // sessionStorage unavailable (privacy mode, file://, etc.) — nothing
    // we can do; bail quietly.
    return;
  }
  if (!message) return;

  const el = document.getElementById("funnel-hint");
  if (!el) return;

  const textEl = el.querySelector(".c-funnel-hint__text");
  const dismissBtn = el.querySelector(".c-funnel-hint__dismiss");

  // textContent (not innerHTML) — defends against any future code path
  // that lets a hint string carry user-derived content. Currently all
  // hint strings are hard-coded in booking.js, but locking the safe
  // assignment now means a future refactor can't quietly open an XSS
  // vector via sessionStorage.
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
