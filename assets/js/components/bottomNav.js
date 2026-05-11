/* =========================================================================
   COMPONENT: BOTTOM NAV
   Handles automatic active state highlighting based on current URL.
   ========================================================================= */

export function initBottomNav() {
  const navItems = document.querySelectorAll('.c-nav__item');
  const currentPath = window.location.pathname;

  navItems.forEach(item => {
    // 1. Remove hardcoded active state first
    item.removeAttribute('aria-current');

    // 2. Logic: Match the href to the current URL
    const itemPath = item.getAttribute('href');
    
    // Check for Home (matches '/' or 'index.html') or other pages
    const isHome = (currentPath === '/' || currentPath.endsWith('index.html')) && itemPath === '/';
    const isMatch = currentPath.endsWith(itemPath) && itemPath !== '/';

    if (isHome || isMatch) {
      item.setAttribute('aria-current', 'page');
    }
  });
}