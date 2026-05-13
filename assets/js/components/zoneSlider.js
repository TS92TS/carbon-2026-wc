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

    paginationContainer.innerHTML = "";
    const dots = [];
    for (let i = 0; i < imageCount; i++) {
      const dot = document.createElement("span");
      dot.className = "c-zone-card__dot";
      if (i === 0) dot.classList.add("is-active");

      paginationContainer.appendChild(dot);
      dots.push(dot);
    }

    const handleFirstInteraction = () => {
      slider.classList.add("is-interacted");

      scrollContainer.style.animation = "none";
      scrollContainer.style.transform = "none";
    };

    scrollContainer.addEventListener("touchstart", handleFirstInteraction, {
      once: true,
      passive: true,
    });

    scrollContainer.addEventListener("mousedown", handleFirstInteraction, {
      once: true,
      passive: true,
    });

    scrollContainer.addEventListener(
      "scroll",
      () => {
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
