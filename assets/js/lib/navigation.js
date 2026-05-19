/* =========================================================================
   NAVIGATION · resolves the `aria-current` + `is-active` state of nav
   items on every page. Environment-agnostic (localhost, GitHub Pages,
   live domains).

   Items declare their role via `data-nav-role`:
     - default          → highlights when the literal href matches the page
     - "funnel"         → highlights ONLY on the booking terminal (book.html)
                          so the Reserve CTA points at the funnel entry
                          (fixtures.html) but lights up only at the end.
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
    // Static aria-current / is-active in HTML are no-JS hints; JS owns
    // the live value.
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");

    // Skip external links. `currentHost` is "" only on file:// — treat
    // any non-empty link.hostname as external in that case.
    if (link.hostname && link.hostname !== currentHost) return;

    const navRole = link.dataset.navRole;

    if (navRole === "funnel") {
      if (isFunnelTerminal) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
      return;
    }

    const linkNormalized = normalize(link.pathname);
    if (currentNormalized === linkNormalized) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}
