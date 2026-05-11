/* =========================================================================
   UNIFIED NAVIGATION (Domain-Aware Version)
   Prevents external links with similar paths from being highlighted.
   ========================================================================= */

export function updateNavStates() {
  const allLinks = document.querySelectorAll(".c-mobile-nav__link, .c-nav__item");
  
  // 1. Get the current site's details
  const currentHost = window.location.hostname;
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";

  allLinks.forEach((link) => {
    // browser-resolved properties
    const linkHost = link.hostname;
    const linkPath = link.pathname.replace(/\/$/, "") || "/";

    // 2. Clear previous states
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");

    // 3. THE GUARD: Only proceed if the link is on the same domain
    if (linkHost !== currentHost) return;

    // 4. Precise matching logic for internal pages
    const isExactMatch = currentPath === linkPath;

    // GitHub Pages / Root index.html fallback
    const isHomeFallback = 
      (currentPath === "/" || currentPath.endsWith("index.html")) && 
      (linkPath === "/" || linkPath.endsWith("index.html"));

    if (isExactMatch || isHomeFallback) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}