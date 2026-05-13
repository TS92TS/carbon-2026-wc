import { getMatchData } from "../lib/matchData.js";

const ZONE_DATA = {
  'carbon': { name: 'Main Bar', img: './assets/img/carbon-thumb.webp' },
  'terrace': { name: 'The Mill Terrace', img: './assets/img/terrace-thumb.webp' },
  'booth': { name: 'VIP Booths', img: './assets/img/booth-thumb.webp' }
};

export async function initBookingConcierge() {
  const els = {
    form: document.querySelector("#booking-form"),
    match: document.querySelector("#f-match"),
    zone: document.querySelector("#f-zone"),
    date: document.querySelector("#f-date"),
    time: document.querySelector("#f-time"),
    summary: document.querySelector("#booking-summary"),
    summaryTitle: document.querySelector("#summary-title"),
    summaryMeta: document.querySelector("#summary-meta"),
    flagA: document.querySelector("#summary-flag-a"),
    flagB: document.querySelector("#summary-flag-b"),
    snapshot: document.querySelector("#zone-snapshot"),
    snapshotImg: document.querySelector("#zone-snapshot-img"),
    snapshotLabel: document.querySelector("#zone-snapshot-label"),
  };

  if (!els.form) return;

  // 1. Fetch & Populate Match Data
  const matchData = await getMatchData();
  const allMatches = [
    ...(matchData?.upcoming || []),
    ...(matchData?.england || []),
  ];

  allMatches.forEach((m) => {
    const d = new Date(m.datetimeIso);
    const opt = document.createElement("option");
    // Store data in value for instant extraction
    opt.value = JSON.stringify({
      slug: `${m.teamA.name} vs ${m.teamB.name}`,
      date: m.datetimeIso.split("T")[0],
      time: m.datetimeIso.split("T")[1].substring(0, 5),
      flagA: m.teamA.flag,
      flagB: m.teamB.flag,
    });
    opt.textContent = `${m.teamA.name} v ${m.teamB.name} (${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })})`;
    els.match.appendChild(opt);
  });

  // 2. Visual Update Helpers
  const updateMatchUI = (info) => {
    els.summary.style.display = "block";
    els.summaryTitle.textContent = info.slug.toUpperCase();
    els.flagA.style.backgroundImage = `url('${info.flagA}')`;
    els.flagB.style.backgroundImage = `url('${info.flagB}')`;
    els.summaryMeta.textContent = `${info.date} · ${info.time}`;
  };

  const updateZoneUI = (zoneValue) => {
    const data = ZONE_DATA[zoneValue];
    if (data) {
      els.summary.style.display = "block";
      els.snapshot.style.display = "flex";
      els.snapshotImg.src = data.img;
      els.snapshotLabel.textContent = data.name;
    }
  };

  // 3. Handle URL Inbound (The Concierge)
  const params = new URLSearchParams(window.location.search);
  if (params.get("fixture")) {
    const matchInfo = {
      slug: params.get("fixture").replace(/-/g, " "),
      date: params.get("date"),
      time: params.get("time"),
      flagA: params.get("flagA"),
      flagB: params.get("flagB"),
    };
    updateMatchUI(matchInfo);
    els.date.value = matchInfo.date;
    els.time.value = matchInfo.time;
  }

  if (params.get("zone")) {
    els.zone.value = params.get("zone");
    updateZoneUI(params.get("zone"));
  }

  // 4. Reactive Listeners
  els.match.addEventListener("change", (e) => {
    if (!e.target.value) return;
    const info = JSON.parse(e.target.value);
    els.date.value = info.date;
    els.time.value = info.time;
    updateMatchUI(info);
  });

  els.zone.addEventListener("change", (e) => updateZoneUI(e.target.value));
}
