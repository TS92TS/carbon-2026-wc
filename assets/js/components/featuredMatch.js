/* =========================================================================
   FEATURED MATCH COMPONENT
   Pure render function — data fetch is handled centrally by matchData.js.
   ========================================================================= */

/**
 * Updates the DOM with the match data.
 * @param {object} data — match object with datetimeIso, badge, teamA, teamB
 */
export function renderFeaturedMatch(data) {
  const card = document.getElementById("featured-match");
  if (!card || !data) return;

  // Helper to safely access values
  const safe = (v) => (v === undefined || v === null ? "" : v);

  if (data.status === "concluded") {
    card.innerHTML =
      '<div class="c-match-card__header">Tournament Concluded</div>';
    card.setAttribute("aria-busy", "false");
    return;
  }

  const matchDate = new Date(safe(data.datetimeIso));
  const dateFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleDateString("en-GB", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });
  const timeFormatted = isNaN(matchDate)
    ? ""
    : matchDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
      });

  const badgeEl = card.querySelector('[data-match-target="badge"]');
  const timeEl = card.querySelector('[data-match-target="time"]');
  const nameAEl = card.querySelector('[data-match-target="name-a"]');
  const flagAEl = card.querySelector('[data-match-target="flag-a"]');
  const nameBEl = card.querySelector('[data-match-target="name-b"]');
  const flagBEl = card.querySelector('[data-match-target="flag-b"]');

  if (badgeEl) badgeEl.textContent = safe(data.badge);
  if (timeEl) {
    timeEl.textContent = `${dateFormatted}${dateFormatted && timeFormatted ? " · " : ""}${timeFormatted}`;
    if (safe(data.datetimeIso))
      timeEl.setAttribute("datetime", safe(data.datetimeIso));
  }

  if (nameAEl) nameAEl.textContent = safe(data.teamA && data.teamA.name);
  if (flagAEl)
    flagAEl.style.backgroundImage = safe(data.teamA && data.teamA.flag)
      ? `url('${safe(data.teamA.flag)}')`
      : "";

  if (nameBEl) nameBEl.textContent = safe(data.teamB && data.teamB.name);
  if (flagBEl)
    flagBEl.style.backgroundImage = safe(data.teamB && data.teamB.flag)
      ? `url('${safe(data.teamB.flag)}')`
      : "";

  card.setAttribute("aria-busy", "false");
}
