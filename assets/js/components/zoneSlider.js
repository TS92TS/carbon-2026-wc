/* =========================================================================
   COMPONENT: ZONE SLIDER (Dynamic Native Swiper)
   ========================================================================= */

export function initZoneSliders() {
  const sliders = document.querySelectorAll('[data-component="zone-slider"]');

  sliders.forEach((slider) => {
    const scrollContainer = slider.querySelector(".c-zone-card__slider");
    const paginationContainer = slider.querySelector(
      ".c-zone-card__pagination",
    );

    if (!scrollContainer || !paginationContainer) return;

    const images = scrollContainer.querySelectorAll("img");
    const imageCount = images.length;

    if (imageCount <= 1) {
      paginationContainer.style.display = "none";
      return;
    }

    // 1. Generate Dots (Fixed: Append Left-to-Right)
    paginationContainer.innerHTML = "";
    const dots = [];
    for (let i = 0; i < imageCount; i++) {
      const dot = document.createElement("span");
      dot.className = "c-zone-card__dot";
      if (i === 0) dot.classList.add("is-active");

      paginationContainer.appendChild(dot); // <--- Fixed line
      dots.push(dot);
    }

    // 2. Interaction Listener (Fires only once to remove hints)
    const handleFirstInteraction = () => {
      // Add class to the parent <article> to trigger CSS fade
      slider.classList.add("is-interacted");

      // Remove the kinetic nudge CSS animation
      scrollContainer.style.animation = "none";

      // Cleanup listeners
      scrollContainer.removeEventListener("scroll", handleFirstInteraction);
      scrollContainer.removeEventListener("touchstart", handleFirstInteraction);
    };

    scrollContainer.addEventListener("scroll", handleFirstInteraction, {
      passive: true,
    });
    scrollContainer.addEventListener("touchstart", handleFirstInteraction, {
      passive: true,
    });

    // 3. Normal scroll sync for dots
    scrollContainer.addEventListener(
      "scroll",
      () => {
        // clientWidth perfectly measures the current viewport of the slider
        const width = scrollContainer.clientWidth;
        const index = Math.round(scrollContainer.scrollLeft / width);

        dots.forEach((dot, i) => {
          dot.classList.toggle("is-active", i === index);
        });
      },
      { passive: true },
    );
  });
}
