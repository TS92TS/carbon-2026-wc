/* =========================================================================
   UNIFIED NAVIGATION (Production Grade)
   Environment-agnostic: Works on Localhost, GitHub Pages, and Live Domains.
   ========================================================================= */

export function updateNavStates() {
  const allLinks = document.querySelectorAll(".c-mobile-nav__link, .c-nav__item");
  
  // 1. Get current location details
  const currentHost = window.location.hostname;
  
  // 2. Helper to "clean" a path to its essence
  // Removes: repo-folders, .html, index, and trailing slashes
  const normalize = (path) => {
    return path
      .split('/')
      .pop()                 // Take only the last part (e.g., 'fixtures.html')
      .replace('.html', '')   // Remove extension
      .replace('index', '')   // Remove 'index'
      || 'home';             // If empty, it's the home page
  };

  const currentNormalized = normalize(window.location.pathname);

  allLinks.forEach((link) => {
    // 3. Clear existing states
    link.classList.remove("is-active");
    link.removeAttribute("aria-current");

    // 4. Domain Guard: Skip external links (like The Mill)
    if (link.hostname !== currentHost && currentHost !== "") return;

    // 5. Compare the "essence" of the link and the browser URL
    const linkNormalized = normalize(link.pathname);

    if (currentNormalized === linkNormalized) {
      link.classList.add("is-active");
      link.setAttribute("aria-current", "page");
    }
  });
}