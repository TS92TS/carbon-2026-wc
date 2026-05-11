/* =========================================================================
   COMPONENT: MOBILE MENU
   Handle the Open/Close toggle and scroll-locking logic.
   ========================================================================= */

export function initMobileMenu() {
  const menuBtn = document.querySelector('.c-header__more');
  const menuOverlay = document.getElementById('mobile-menu');
  const body = document.body;

  if (!menuBtn || !menuOverlay) return;

  menuBtn.addEventListener('click', () => {
    const isOpen = body.classList.toggle('is-menu-open');
    menuBtn.setAttribute('aria-expanded', isOpen);
    menuOverlay.setAttribute('aria-hidden', !isOpen);
    body.style.overflow = isOpen ? 'hidden' : '';
  });

  // Close menu when clicking a link
  menuOverlay.addEventListener('click', (e) => {
    if (e.target.closest('.c-mobile-nav__link')) {
      body.classList.remove('is-menu-open');
      body.style.overflow = '';
      menuBtn.setAttribute('aria-expanded', 'false');
    }
  });
}