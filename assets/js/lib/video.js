/* =========================================================================
   COMPONENT: SCROLL VIDEO (Lazy Playback)
   Uses IntersectionObserver to play/pause videos based on visibility.
   ========================================================================= */

export function initScrollVideos() {
  const videos = document.querySelectorAll('[data-component="scroll-video"]');
  if (!videos.length) return;

  // Respect the user's data-saver / reduced-motion preferences entirely.
  const reducedData = window.matchMedia(
    "(prefers-reduced-data: reduce)",
  ).matches;
  const reducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (reducedData || reducedMotion) return;

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const playPromise = entry.target.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {});
          }
        } else {
          entry.target.pause();
        }
      });
    },
    {
      threshold: 0.2,
    },
  );

  videos.forEach((video) => {
    observer.observe(video);
  });
}
