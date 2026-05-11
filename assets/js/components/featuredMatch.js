/* =========================================================================
   FEATURED MATCH COMPONENT
   Fetches the next match from our secure Cloudflare proxy and injects it.
   ========================================================================= */

export async function initFeaturedMatch() {
  const card = document.getElementById('featured-match');
  if (!card) return;

  try {
    // 1. Point this to your new Cloudflare Pages API domain
    const CLOUDFLARE_API_URL = 'https://carbon-sports-api.pages.dev/api/get-next-match';
    
    const response = await fetch(CLOUDFLARE_API_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const nextMatch = await response.json();

    if (nextMatch.status === 'concluded') {
      card.innerHTML = '<div class="c-match-card__header">Tournament Concluded</div>';
      card.setAttribute('aria-busy', 'false');
      return;
    }

    // 2. Format the date (e.g., "Thu 11 Jun · 20:00")
    const matchDate = new Date(nextMatch.datetimeIso);
    const dateFormatted = matchDate.toLocaleDateString('en-GB', { 
      weekday: 'short', day: 'numeric', month: 'short' 
    });
    const timeFormatted = matchDate.toLocaleTimeString('en-GB', { 
      hour: '2-digit', minute: '2-digit' 
    });

    // 3. Inject the data into the HTML data targets
    card.querySelector('[data-match-target="badge"]').textContent = nextMatch.badge;
    
    const timeEl = card.querySelector('[data-match-target="time"]');
    timeEl.textContent = `${dateFormatted} · ${timeFormatted}`;
    timeEl.setAttribute('datetime', nextMatch.datetimeIso);

    card.querySelector('[data-match-target="name-a"]').textContent = nextMatch.teamA.name;
    card.querySelector('[data-match-target="flag-a"]').style.backgroundImage = `url('${nextMatch.teamA.flag}')`;

    card.querySelector('[data-match-target="name-b"]').textContent = nextMatch.teamB.name;
    card.querySelector('[data-match-target="flag-b"]').style.backgroundImage = `url('${nextMatch.teamB.flag}')`;

    // 4. Remove the loading state to stop the skeleton pulse
    card.setAttribute('aria-busy', 'false');

  } catch (error) {
    console.error('Failed to load featured match:', error);
    card.querySelector('[data-match-target="badge"]').textContent = 'Data Unavailable';
    card.setAttribute('aria-busy', 'false');
  }
}