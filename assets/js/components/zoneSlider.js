/* =========================================================================
   COMPONENT: ZONE SLIDER
   Synchronizes the swipe position with the UI pagination dots.
   ========================================================================= */

export function initZoneSliders() {
  const sliders = document.querySelectorAll('[data-component="zone-slider"]');

  sliders.forEach(slider => {
    const scrollContainer = slider.querySelector('.c-zone-card__slider');
    const dots = slider.querySelectorAll('.c-zone-card__dot');

    if (!scrollContainer || dots.length === 0) return;

    scrollContainer.addEventListener('scroll', () => {
      // Calculate current index based on scroll position
      const width = scrollContainer.offsetWidth;
      const index = Math.round(scrollContainer.scrollLeft / width);

      // Update Dots
      dots.forEach((dot, i) => {
        dot.classList.toggle('is-active', i === index);
      });
    }, { passive: true });
  });
}