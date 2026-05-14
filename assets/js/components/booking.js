import { getMatchData } from "../lib/matchData.js";
import { safeBackgroundUrl } from "../lib/urlHelpers.js";

const IMG = new URL("../../img/", import.meta.url).href;

const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "The Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booths", img: `${IMG}booth-thumb.webp` },
};

const TOURNAMENT_DISPLAY_LIMIT = 20;

const safe = (v, fallback = "") =>
  v === undefined || v === null ? fallback : v;

export async function initBookingConcierge() {
  const els = {
    form: document.querySelector("#booking-form"),
    match: document.querySelector("#f-match"),
    zone: document.querySelector("#f-zone"),
    date: document.querySelector("#f-date"),
    time: document.querySelector("#f-time"),
    guests: document.querySelector("#f-guests"),
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
  const zoneParam = params.get("zone");
  const guestsParam = params.get("guests");

  const showSummary = () => {
    if (els.summary) els.summary.removeAttribute("hidden");
  };

  const updateMatchUI = (info) => {
    showSummary();
    if (els.summaryTitle)
      els.summaryTitle.textContent = (info.slug || "").toUpperCase();
    if (els.flagA)
      els.flagA.style.backgroundImage = safeBackgroundUrl(info.flagA);
    if (els.flagB)
      els.flagB.style.backgroundImage = safeBackgroundUrl(info.flagB);
    const metaParts = [info.date, info.time].filter(Boolean);
    if (els.summaryMeta) els.summaryMeta.textContent = metaParts.join(" · ");
    if (!els.zone || !els.zone.value) {
      if (els.snapshot) els.snapshot.setAttribute("hidden", "");
    }
  };

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

  // Apply zone BEFORE match so updateMatchUI's snapshot-hidden check sees the
  // populated state and doesn't toggle the snapshot off then on again.
  if (zoneParam && els.zone) {
    els.zone.value = zoneParam;
    updateZoneUI(zoneParam);
  }

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

  if (guestsParam && els.guests) {
    const n = parseInt(guestsParam, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) {
      els.guests.value = String(n);
    }
  }

  // Stepper: must initialise BEFORE the await below so the +/- buttons remain
  // functional even when match data is unavailable.
  const stepper = document.querySelector('[data-component="stepper"]');
  if (stepper) {
    const stepInput = stepper.querySelector("input");
    const stepBtns = stepper.querySelectorAll("[data-step]");
    const stepMin = parseInt(stepInput.min, 10) || 1;
    const stepMax = parseInt(stepInput.max, 10) || 20;

    const syncStepperDisabled = () => {
      const current = parseInt(stepInput.value, 10) || stepMin;
      stepBtns.forEach((btn) => {
        const delta = parseInt(btn.dataset.step, 10);
        const next = current + delta;
        btn.disabled = next < stepMin || next > stepMax;
      });
    };

    stepper.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-step]");
      if (!btn || btn.disabled) return;
      const delta = parseInt(btn.dataset.step, 10);
      const current = parseInt(stepInput.value, 10) || stepMin;
      const next = Math.max(stepMin, Math.min(stepMax, current + delta));
      if (next !== current) {
        stepInput.value = String(next);
        stepInput.dispatchEvent(new Event("change", { bubbles: true }));
        syncStepperDisabled();
      }
    });

    // Manual typing: strip non-digits as the user types but don't clamp yet
    // (so they can transition through invalid intermediate states like "").
    stepInput.addEventListener("input", () => {
      const cleaned = stepInput.value.replace(/\D/g, "");
      if (cleaned !== stepInput.value) stepInput.value = cleaned;
      syncStepperDisabled();
    });

    // On blur, enforce min/max. Empty or sub-min snaps to min; over-max snaps
    // to max. Avoids hostile mid-edit autocorrect.
    stepInput.addEventListener("blur", () => {
      const n = parseInt(stepInput.value, 10);
      let clamped;
      if (!Number.isFinite(n) || n < stepMin) clamped = stepMin;
      else if (n > stepMax) clamped = stepMax;
      else clamped = n;
      if (String(clamped) !== stepInput.value) {
        stepInput.value = String(clamped);
        stepInput.dispatchEvent(new Event("change", { bubbles: true }));
        syncStepperDisabled();
      }
    });

    syncStepperDisabled();
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

  if (!matchData || matchData.status === "error") {
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
