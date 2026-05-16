import { getMatchData, formatMatchDateTime } from "../lib/matchData.js";
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
    policy: document.querySelector("#match-policy"),
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
    // Prefer the readable label ("Mon 12 Jun") for parity with the dropdown
    // text; fall back to the ISO date if a legacy caller omits it.
    const dateText = info.dateLabel || info.date;
    const metaParts = [dateText, info.time].filter(Boolean);
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

  /* -----------------------------------------------------------------------
     STATE-DRIVEN LOCK
     A fixture binds Date+Time to the canonical kickoff. `readonly` (NOT
     `disabled`) preserves the values in the FormData payload for the Sheets
     backend; the `.is-locked` class layers the visual + pointer-event lock.
     ----------------------------------------------------------------------- */
  const lockDateTime = () => {
    if (els.date) {
      els.date.setAttribute("readonly", "");
      els.date.classList.add("is-locked");
    }
    if (els.time) {
      els.time.setAttribute("readonly", "");
      els.time.classList.add("is-locked");
    }
    if (els.policy) els.policy.removeAttribute("hidden");
  };

  /**
   * Build the canonical {slug,date,time,flagA,flagB} info object and apply
   * it to both the summary panel and the (now locked) form inputs. Single
   * write-through point — guarantees the displayed text and the form values
   * are sourced from the same `formatMatchDateTime` call.
   */
  const applyCanonicalMatch = (match) => {
    const fmt = formatMatchDateTime(match.datetimeIso);
    if (!fmt) return;
    const info = {
      slug: `${safe(match.teamA?.name, "TBD")} vs ${safe(match.teamB?.name, "TBD")}`,
      date: fmt.dateInputValue,
      time: fmt.time,
      dateLabel: fmt.dateShort,
      flagA: safe(match.teamA?.flag),
      flagB: safe(match.teamB?.flag),
    };
    // Select the matching <option> by full value (slug + date + time) so the
    // rematch case resolves to the exact canonical entry. Skipped silently
    // if the dropdown hasn't been populated yet — callers always invoke
    // after population.
    if (els.match) {
      const target = JSON.stringify(info);
      for (const opt of els.match.options) {
        if (opt.value === target) {
          opt.selected = true;
          break;
        }
      }
    }
    if (els.date) els.date.value = info.date;
    if (els.time) els.time.value = info.time;
    updateMatchUI(info);
    lockDateTime();
  };

  // Apply zone BEFORE match so updateMatchUI's snapshot-hidden check sees the
  // populated state and doesn't toggle the snapshot off then on again.
  if (zoneParam && els.zone) {
    els.zone.value = zoneParam;
    updateZoneUI(zoneParam);
  }

  // NOTE: URL `date`/`time` params are intentionally NOT applied here. Any
  // value the user could craft (?date=2099-01-01&time=14:00) is ignored;
  // the canonical kickoff is sourced from matchData below.

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

    // Select the value on focus so the user's first keypress replaces it —
    // no manual delete of the default needed.
    stepInput.addEventListener("focus", () => stepInput.select());

    // Funnel cue: when both match and zone have been carried through from the
    // upstream pages, the guest count is the only required field remaining.
    // Apply a subtle highlight that auto-clears on first focus, so the cue
    // never lingers once the user engages.
    if (fixtureParam && zoneParam) {
      stepper.classList.add("c-stepper--highlight");
      stepper.addEventListener(
        "focusin",
        () => stepper.classList.remove("c-stepper--highlight"),
        { once: true },
      );
    }

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
    const fmt = formatMatchDateTime(m?.datetimeIso);
    if (!fmt) return null;

    const teamA = safe(m.teamA?.name, "TBD");
    const teamB = safe(m.teamB?.name, "TBD");
    const slug = `${teamA} vs ${teamB}`;

    // Dedupe by teams + instant so the same fixture appearing in both the
    // England and tournament arrays collapses, but a rematch (group + KO)
    // remains addressable.
    const dedupeKey = `${slug}@${fmt.iso}`;
    if (seenSlugs.has(dedupeKey)) return null;
    seenSlugs.add(dedupeKey);

    const opt = document.createElement("option");
    // Value remains a stable, machine-parseable identifier for the booking
    // engine. `date` / `time` are Europe/London — they populate the form's
    // <input type="date"> / <input type="time"> and must agree with what the
    // user just read in the option label.
    opt.value = JSON.stringify({
      slug,
      date: fmt.dateInputValue,
      time: fmt.time,
      dateLabel: fmt.dateShort,
      flagA: safe(m.teamA?.flag),
      flagB: safe(m.teamB?.flag),
    });

    opt.textContent = `${teamA} v ${teamB} — ${fmt.dateShort} · ${fmt.time}`;

    // NOTE: Auto-selecting here on slug-only match would pick the wrong
    // option in the rematch case (group + KO with identical teams).
    // Selection is performed centrally in applyCanonicalMatch using the full
    // canonical value (slug + date + time), guaranteeing dropdown text and
    // form values agree.
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
    // Single disabled+hidden placeholder — the dropdown is required, so the
    // user must pick a real fixture. No "general booking" escape hatch:
    // every reservation must be bound to a specific kickoff.
    els.match.innerHTML =
      '<option value="" disabled selected hidden>Select your match...</option>';
    els.match.appendChild(fragment);
  }

  /* -----------------------------------------------------------------------
     CANONICAL LOOKUP — closes the URL-tampering vector. The URL contributes
     ONLY `fixture` (slug) as a routing hint; `date`/`time` URL params are
     treated as untrusted disambiguation hints at most. The authoritative
     kickoff is always derived from matchData via formatMatchDateTime.
     ----------------------------------------------------------------------- */
  const findCanonicalMatch = (data, fixtureSlug, hintDate) => {
    if (!fixtureSlug) return null;
    const norm = fixtureSlug.toLowerCase();
    const pool = [
      ...(Array.isArray(data.england) ? data.england : []),
      ...(Array.isArray(data.upcoming) ? data.upcoming : []),
    ];
    const candidates = pool.filter((m) => {
      const slug = `${m.teamA?.name || ""}-vs-${m.teamB?.name || ""}`
        .toLowerCase()
        .replace(/\s+/g, "-");
      return slug === norm;
    });
    if (candidates.length <= 1) return candidates[0] || null;
    // Rematch case (group + KO with same teams): use the URL date param ONLY
    // as a tie-breaker against the matchData calendar. If it doesn't match,
    // fall back to chronological order — never trust the URL outright.
    if (hintDate) {
      const dateMatch = candidates.find(
        (m) => formatMatchDateTime(m.datetimeIso)?.dateInputValue === hintDate,
      );
      if (dateMatch) return dateMatch;
    }
    return candidates.sort(
      (a, b) => new Date(a.datetimeIso) - new Date(b.datetimeIso),
    )[0];
  };

  if (fixtureParam) {
    const canonical = findCanonicalMatch(
      matchData,
      fixtureParam,
      params.get("date"),
    );
    if (canonical) {
      // Selects the exact matching <option> (rematch-safe via full-value
      // equality), overwrites any URL-supplied date/time with the canonical
      // kickoff, and engages the lock.
      applyCanonicalMatch(canonical);
    }
    // If lookup failed (stale link, removed fixture), do nothing — the form
    // stays unlocked and the user can pick from the dropdown.
  }

  if (els.match) {
    els.match.addEventListener("change", (e) => {
      const raw = e.target.value;
      // Placeholder cannot fire change (disabled+hidden), but a defensive
      // guard keeps the handler total in case of future markup changes.
      if (!raw) return;
      try {
        const info = JSON.parse(raw);
        // Forcibly overwrite — prevents desync if the user had previously
        // typed a custom date and only afterwards picked a match.
        if (els.date) els.date.value = info.date;
        if (els.time) els.time.value = info.time;
        updateMatchUI(info);
        lockDateTime();
      } catch (err) {
        console.warn("Booking: Failed to parse match selection", err);
      }
    });
  }

  if (els.zone) {
    els.zone.addEventListener("change", (e) => updateZoneUI(e.target.value));
  }
}
