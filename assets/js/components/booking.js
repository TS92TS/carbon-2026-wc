import { getMatchData } from "../lib/matchData.js";

const ZONE_DATA = {
  carbon:  { name: "Main Bar",       img: "./assets/img/carbon-thumb.webp" },
  terrace: { name: "The Mill Terrace", img: "./assets/img/terrace-thumb.webp" },
  booth:   { name: "VIP Booths",       img: "./assets/img/booth-thumb.webp" },
};

// UX CONFIGURATION
const TOURNAMENT_DISPLAY_LIMIT = 20; // Keeps the list ergonomic and fast

const safe = (v, fallback = "") =>
  v === undefined || v === null ? fallback : v;

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

  // ---- 1. INSTANT RENDER (URL Parsing) ----------------------------------
  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get("fixture");

  const showSummary = () => els.summary.removeAttribute("hidden");

  const updateMatchUI = (info) => {
    showSummary();
    els.summaryTitle.textContent = (info.slug || "").toUpperCase();
    if (info.flagA) els.flagA.style.backgroundImage = `url('${info.flagA}')`;
    if (info.flagB) els.flagB.style.backgroundImage = `url('${info.flagB}')`;
    const metaParts = [info.date, info.time].filter(Boolean);
    els.summaryMeta.textContent = metaParts.join(" · ");
    if (!els.zone.value) els.snapshot.setAttribute("hidden", "");
  };

  if (fixtureParam) {
    const matchInfo = {
      slug: fixtureParam.replace(/-/g, " "),
      date: params.get("date"),
      time: params.get("time"),
      flagA: params.get("flagA"),
      flagB: params.get("flagB"),
    };
    updateMatchUI(matchInfo);
    if (matchInfo.date) els.date.value = matchInfo.date;
    if (matchInfo.time) els.time.value = matchInfo.time;
  }

  const updateZoneUI = (zoneValue) => {
    const data = ZONE_DATA[zoneValue];
    if (!data) return;
    showSummary();
    els.snapshot.removeAttribute("hidden");
    els.snapshotImg.src = data.img;
    els.snapshotImg.alt = data.name;
    els.snapshotLabel.textContent = data.name;
  };

  if (params.get("zone")) {
    els.zone.value = params.get("zone");
    updateZoneUI(params.get("zone"));
  }

  // ---- 2. LOADING STATE -------------------------------------------------
  els.match.innerHTML = '<option value="" disabled selected>Loading fixtures...</option>';

  // ---- 3. SLICED POPULATION (Performance + Ergonomics) ------------------
  let matchData;
  try {
    matchData = await getMatchData();
  } catch (err) {
    console.warn("Booking: Data load failed.");
    els.match.innerHTML = '<option value="" disabled selected>Fixtures unavailable</option>';
    return;
  }

  const seenSlugs = new Set();
  const fragment = document.createDocumentFragment();

  const createOption = (m) => {
    if (!m?.datetimeIso) return null;
    const teamA = safe(m.teamA?.name, "TBD");
    const teamB = safe(m.teamB?.name, "TBD");
    const slug = `${teamA} vs ${teamB}`;
    
    if (seenSlugs.has(slug)) return null;
    seenSlugs.add(slug);

    const [datePart, timePart = ""] = m.datetimeIso.split("T");
    const d = new Date(m.datetimeIso);
    const dateLabel = isNaN(d) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    const opt = document.createElement("option");
    opt.value = JSON.stringify({
      slug, date: datePart, time: timePart.substring(0, 5),
      flagA: safe(m.teamA?.flag), flagB: safe(m.teamB?.flag)
    });
    
    opt.textContent = `${teamA} v ${teamB} — ${dateLabel}`;

    if (fixtureParam && slug.toLowerCase() === fixtureParam.replace(/-/g, " ").toLowerCase()) {
      opt.selected = true;
    }
    return opt;
  };

  // PASS 1: England Fixtures (Unlimited - High Priority)
  const engArray = Array.isArray(matchData?.england) ? matchData.england : [];
  if (engArray.length > 0) {
    const engGroup = document.createElement("optgroup");
    engGroup.label = ">> ENGLAND FIXTURES";
    engArray.forEach(m => {
      const opt = createOption(m);
      if (opt) engGroup.appendChild(opt);
    });
    fragment.appendChild(engGroup);
  }

  // PASS 2: Sliced Tournament Fixtures (Optimal UX)
  const tourneyArray = Array.isArray(matchData?.upcoming) ? matchData.upcoming : [];
  if (tourneyArray.length > 0) {
    const tourneyGroup = document.createElement("optgroup");
    tourneyGroup.label = `>> NEXT ${TOURNAMENT_DISPLAY_LIMIT} TOURNAMENT FIXTURES`;
    
    // We slice here to keep the dropdown physically short and mentally manageable
    tourneyArray.slice(0, TOURNAMENT_DISPLAY_LIMIT).forEach(m => {
      const opt = createOption(m);
      if (opt) tourneyGroup.appendChild(opt);
    });
    fragment.appendChild(tourneyGroup);
  }

  // Atomic Update
  els.match.innerHTML = '<option value="" disabled selected hidden>Watching a specific match?</option>';
  els.match.appendChild(fragment);

  // ---- 4. LISTENERS -----------------------------------------------------
  els.match.addEventListener("change", (e) => {
    if (!e.target.value) return;
    try {
      const info = JSON.parse(e.target.value);
      els.date.value = info.date;
      els.time.value = info.time;
      updateMatchUI(info);
    } catch (err) {}
  });

  els.zone.addEventListener("change", (e) => updateZoneUI(e.target.value));
}