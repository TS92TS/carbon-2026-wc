import { getMatchData } from "../lib/matchData.js";

const IMG = new URL("../../img/", import.meta.url).href;

const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "The Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booths", img: `${IMG}booth-thumb.webp` },
};

const TOURNAMENT_DISPLAY_LIMIT = 20;

const safe = (v, fallback = "") =>
  v === undefined || v === null ? fallback : v;

const cleanUrl = (url) => {
  if (!url) return "";
  if (/^javascript:/i.test(url)) return "";
  return url.replace(/[\'"]/g, "");
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

  if (els.form.dataset.initialized === "true") return;
  els.form.dataset.initialized = "true";

  const params = new URLSearchParams(window.location.search);
  const fixtureParam = params.get("fixture");

  const showSummary = () => {
    if (els.summary) els.summary.removeAttribute("hidden");
  };

  const updateMatchUI = (info) => {
    showSummary();
    if (els.summaryTitle)
      els.summaryTitle.textContent = (info.slug || "").toUpperCase();
    if (info.flagA && els.flagA) {
      const clean = cleanUrl(info.flagA);
      if (clean) els.flagA.style.backgroundImage = `url('${clean}')`;
    }
    if (info.flagB && els.flagB) {
      const clean = cleanUrl(info.flagB);
      if (clean) els.flagB.style.backgroundImage = `url('${clean}')`;
    }
    const metaParts = [info.date, info.time].filter(Boolean);
    if (els.summaryMeta) els.summaryMeta.textContent = metaParts.join(" · ");
    if (!els.zone || !els.zone.value) {
      if (els.snapshot) els.snapshot.setAttribute("hidden", "");
    }
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
    if (matchInfo.date && els.date) els.date.value = matchInfo.date;
    if (matchInfo.time && els.time) els.time.value = matchInfo.time;
  }

  const updateZoneUI = (zoneValue) => {
    const data = ZONE_DATA[zoneValue];
    if (!data) return;
    showSummary();
    if (els.snapshot) els.snapshot.removeAttribute("hidden");
    if (els.snapshotImg) {
      els.snapshotImg.src = data.img;
      els.snapshotImg.alt = data.name;
    }
    if (els.snapshotLabel) els.snapshotLabel.textContent = data.name;
  };

  if (params.get("zone") && els.zone) {
    els.zone.value = params.get("zone");
    updateZoneUI(params.get("zone"));
  }

  if (els.match) {
    els.match.innerHTML =
      '<option value="" disabled selected>Loading fixtures...</option>';
  }

  let matchData;
  try {
    matchData = await getMatchData();
  } catch (err) {
    console.warn("Booking: Data load failed.", err);
    if (els.match) {
      els.match.innerHTML =
        '<option value="" disabled selected>Fixtures unavailable</option>';
    }
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
    // FIX: Added weekday to dropdown label for consistency with site cards
    const dateLabel = isNaN(d)
      ? ""
      : d.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
        });

    const opt = document.createElement("option");
    opt.value = JSON.stringify({
      slug,
      date: datePart,
      time: timePart.substring(0, 5),
      flagA: safe(m.teamA?.flag),
      flagB: safe(m.teamB?.flag),
    });

    opt.textContent = `${teamA} v ${teamB} — ${dateLabel}`;

    if (
      fixtureParam &&
      slug.toLowerCase() === fixtureParam.replace(/-/g, " ").toLowerCase()
    ) {
      opt.selected = true;
    }
    return opt;
  };

  const engArray = Array.isArray(matchData?.england) ? matchData.england : [];
  if (engArray.length > 0 && els.match) {
    const engGroup = document.createElement("optgroup");
    engGroup.label = ">> ENGLAND FIXTURES";
    engArray.forEach((m) => {
      const opt = createOption(m);
      if (opt) engGroup.appendChild(opt);
    });
    fragment.appendChild(engGroup);
  }

  const tourneyArray = Array.isArray(matchData?.upcoming)
    ? matchData.upcoming
    : [];
  if (tourneyArray.length > 0 && els.match) {
    const tourneyGroup = document.createElement("optgroup");
    tourneyGroup.label = `>> NEXT ${TOURNAMENT_DISPLAY_LIMIT} TOURNAMENT FIXTURES`;

    tourneyArray.slice(0, TOURNAMENT_DISPLAY_LIMIT).forEach((m) => {
      const opt = createOption(m);
      if (opt) tourneyGroup.appendChild(opt);
    });
    fragment.appendChild(tourneyGroup);
  }

  if (els.match) {
    els.match.innerHTML =
      '<option value="" disabled selected hidden>Watching a specific match?</option>';
    els.match.appendChild(fragment);
  }

  if (els.match) {
    els.match.addEventListener("change", (e) => {
      if (!e.target.value) return;
      try {
        const info = JSON.parse(e.target.value);
        if (els.date) els.date.value = info.date;
        if (els.time) els.time.value = info.time;
        updateMatchUI(info);
      } catch (err) {
        console.warn("Booking: Failed to parse match selection", err);
      }
    });
  }

  if (els.zone) {
    els.zone.addEventListener("change", (e) => updateZoneUI(e.target.value));
  }
}
