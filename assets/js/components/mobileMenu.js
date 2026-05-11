export function initMobileMenu() {
  const menuBtn = document.querySelector('.c-header__more');
  const menuOverlay = document.getElementById('mobile-menu');
  const body = document.body;
  const navLinks = document.querySelectorAll('.c-mobile-nav__link');

  if (!menuBtn || !menuOverlay) return;

  // 1. Highlight Active Page
  const currentPath = window.location.pathname;
  
  navLinks.forEach(link => {
    // Remove any hardcoded active classes
    link.classList.remove('u-accent', 'is-active');
    
    // Check if link href matches current path (handling home page '/')
    const linkPath = link.getAttribute('href');
    if (currentPath === linkPath || (currentPath === '/index.html' && linkPath === '/')) {
      link.classList.add('is-active');
    }
  });

  // 2. Toggle Logic
  menuBtn.addEventListener('click', () => {
    const isOpen = body.classList.toggle('is-menu-open');
    
    // Accessibility
    menuBtn.setAttribute('aria-expanded', isOpen);
    menuOverlay.setAttribute('aria-hidden', !isOpen);
    
    // Lock scroll
    body.style.overflow = isOpen ? 'hidden' : '';
  });

  // 3. Close on link click or backdrop click
  menuOverlay.addEventListener('click', (e) => {
    // If they click a link or the empty space of the overlay, close it
    if (e.target.classList.contains('c-mobile-nav__link') || e.target === menuOverlay) {
      closeMenu();
    }
  });

  function closeMenu() {
    body.classList.remove('is-menu-open');
    body.style.overflow = '';
    menuBtn.setAttribute('aria-expanded', 'false');
  }
}