/*=================================
UNIFIED NAVIGATION
=================================*/

export function updateNavStates() {
  const allLinks = document.querySelectorAll('.c-mobile-nav__link, .c-nav__item');
  const path = window.location.pathname;

  allLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (!href) return;

    // Remove active markers
    link.classList.remove('is-active');
    link.removeAttribute('aria-current');

    // Robust matching logic
    const isHome = (path === '/' || path.endsWith('index.html')) && 
                   (href === '/' || href.includes('index.html'));
    
    const isOtherPage = href !== '/' && !href.includes('index.html') && path.includes(href.replace('./', ''));

    if (isHome || isOtherPage) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
  });
}