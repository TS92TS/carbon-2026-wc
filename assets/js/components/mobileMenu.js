/* =========================================================================
   COMPONENT: MOBILE MENU
   Handle the Open/Close toggle and scroll-locking logic.
   ========================================================================= */

export function initMobileMenu() {
  const menuBtn = document.querySelector(".c-header__more");
  const menuOverlay = document.getElementById("mobile-menu");
  const body = document.body;

  if (!menuBtn || !menuOverlay) return;

  let savedScrollY = 0;

  const openMenu = () => {
    savedScrollY = window.scrollY;
    body.classList.add("is-menu-open");
    menuBtn.setAttribute("aria-expanded", "true");
    menuOverlay.setAttribute("aria-hidden", "false");
    // iOS-safe scroll lock: pin the body and restore on close.
    body.style.position = "fixed";
    body.style.top = `-${savedScrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
  };

  const closeMenu = () => {
    body.classList.remove("is-menu-open");
    menuBtn.setAttribute("aria-expanded", "false");
    menuOverlay.setAttribute("aria-hidden", "true");
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    window.scrollTo(0, savedScrollY);
  };

  menuBtn.addEventListener("click", () => {
    body.classList.contains("is-menu-open") ? closeMenu() : openMenu();
  });

  menuOverlay.addEventListener("click", (e) => {
    if (e.target.closest(".c-mobile-nav__link")) closeMenu();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && body.classList.contains("is-menu-open")) {
      closeMenu();
      menuBtn.focus();
    }
  });
}
