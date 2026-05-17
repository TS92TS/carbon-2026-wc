/* =========================================================================
   UNIFIED NAVIGATION (Production Grade)
   Environment-agnostic: Works on Localhost, GitHub Pages, urls and Live Domains.

   Nav items declare their role via `data-nav-role`:
     - "page"   (default, no attribute needed) — highlights when the literal
                href matches the current page.
     - "funnel"                                — highlights ONLY when the user
                is on the booking terminal (book.html). On fixtures/zones the
                page-bound nav already shows where the user is, so adding a
                second highlight would be visual noise. This decouples the
                "you're at the booking step" indicator from the literal href —
                Reserve points at fixtures.html (the funnel entry) but lights
                up only at the terminal.
   ========================================================================= */

const FUNNEL_TERMINAL_PAGES = new Set(["book"]);

const normalize = (path) =>
  path.split("/").pop().replace(".html", "").replace("index", "") || "home";

export function updateNavStates() {
  const allLinks = document.querySelectorAll(
    ".c-mobile-nav__link, .c-nav__item",
  );

  const currentHost = window.location.hostname;
  const currentNormalized = normalize(window.location.pathname);
  const isFunnelTerminal = FUNNEL_TERMINAL_PAGES.has(currentNormalized);

  allLinks.forEach((link) => {
    // Clear any stale state — static aria-current and is-active from the
    // HTML are treated as no-JS hints only; JS owns the live value.
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");

    // Domain Guard: Skip external links regardless of protocol.
    // (link.hostname is always populated; currentHost is "" only on file://.
    //  If currentHost is empty we treat any non-empty link.hostname as external.)
    if (link.hostname && link.hostname !== currentHost) return;

    const navRole = link.dataset.navRole;

    if (navRole === "funnel") {
      // Funnel-bound items light up at the booking terminal only.
      if (isFunnelTerminal) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
      return;
    }

    // Page-bound items: literal path match.
    const linkNormalized = normalize(link.pathname);
    if (currentNormalized === linkNormalized) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}
