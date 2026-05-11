// File: assets/js/components/upcomingMatches.js

export function renderUpcomingList(data) {
  const container = document.getElementById("upcoming-fixtures-list");
  if (!container || !data?.upcoming) return;

  // Clear skeletons/static content
  container.innerHTML = "";

  data.upcoming.forEach((match) => {
    const date = new Date(match.datetimeIso);

    // Format: "Fri 12 Jun · 20:00"
    const dateStr = date.toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    const timeStr = date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const li = document.createElement("li");

    // We recreate your exact HTML structure so your existing CSS works perfectly
    li.innerHTML = `
      <a class="c-fixture-row" href="/fixtures.html">
        <div class="c-fixture-row__teams">
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: url('${match.teamA.flag}')" aria-hidden="true"></span>
            ${match.teamA.name}
          </span>
          <span class="c-fixture-row__vs">vs</span>
          <span class="c-fixture-row__team">
            <span class="c-fixture-row__flag" style="background-image: url('${match.teamB.flag}')" aria-hidden="true"></span>
            ${match.teamB.name}
          </span>
        </div>
        <p class="c-fixture-row__meta">${dateStr} · ${timeStr} · ${match.badge}</p>
        <span class="c-fixture-row__arrow" aria-hidden="true">→</span>
      </a>
    `;

    container.appendChild(li);
  });
}
