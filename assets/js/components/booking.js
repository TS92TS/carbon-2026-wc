import {
  getMatchData,
  formatMatchDateTime,
  getDetailedStageLabel,
  isAnonymousMatch,
  formatFixtureDisplay,
} from "../lib/matchData.js";
import { safeBackgroundUrl } from "../lib/urlHelpers.js";
import {
  TROPHY_SVG_MARKUP,
  ZONE_DATA,
  VALID_ZONES,
} from "../lib/constants.js";

/* -------------------------------------------------------------------------
   TALLY HANDOFF · the funnel exits the SPA at submit-time. Five params
   ride into the live Tally form (case-sensitive):
       fixture, date, time, zone, guests
   Tally → double-opt-in email → webhook → Google Sheets ledger → Brevo.
   Field `name=""` attributes on book.html match Tally's hidden-field
   names exactly, so FormData → URLSearchParams forwards directly.
   ------------------------------------------------------------------------- */
const TALLY_FORM_ID = "9qRELY";
const TALLY_URL_BASE = `https://tally.so/r/${TALLY_FORM_ID}`;
const VENUE_PHONE_DISPLAY = "01449 674674";

/* -------------------------------------------------------------------------
   FUNNEL GATE · book.html has no useful UI without both fixture + zone.
   Missing/invalid → redirect to the right step with a sessionStorage
   hint string that funnelHint.js surfaces on arrival.
   ------------------------------------------------------------------------- */
const REDIRECT_HINT_KEY = "carbon_funnel_redirect_hint";

const safe = (v, fallback = "") =>
  v === undefined || v === null ? fallback : v;

function redirectToFunnel(destination, hintMessage) {
  try {
    if (hintMessage) sessionStorage.setItem(REDIRECT_HINT_KEY, hintMessage);
  } catch (e) {
    /* sessionStorage unavailable — proceed without hint */
  }
  // `replace` (not `assign`) so the back button doesn't sandwich the
  // user inside a redirect chain.
  window.location.replace(destination);
}

/**
 * Find a still-bookable match whose team slug matches `fixtureSlug`.
 * Slug normalisation MUST mirror urlHelpers.buildMatchURL exactly: both
 * use "tbd" (not "") as the empty-team fallback so "tbd-vs-tbd" links
 * resolve. Ambiguous TBD-vs-TBD slugs are disambiguated by the URL's
 * `hintDate` (the user's clicked Europe/London date); without a hint,
 * the earliest candidate wins.
 * Returns null for stale links (passed / withdrawn / past 3-h cutoff).
 */
function findBookableMatch(matchData, fixtureSlug, hintDate) {
  if (!fixtureSlug || !matchData) return null;
  const norm = fixtureSlug.toLowerCase();
  const pool = [
    ...(Array.isArray(matchData.england) ? matchData.england : []),
    ...(Array.isArray(matchData.upcoming) ? matchData.upcoming : []),
  ].filter((m) => m?.isBookable);

  const candidates = pool.filter((m) => {
    const teamA = (m.teamA?.name ?? "").trim() || "tbd";
    const teamB = (m.teamB?.name ?? "").trim() || "tbd";
    const slug = `${teamA}-vs-${teamB}`.toLowerCase().replace(/\s+/g, "-");
    return slug === norm;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // Multiple matches share the slug (ambiguous "tbd-vs-tbd" or a rare
  // legitimate rematch). Disambiguate by the URL's date hint when present;
  // otherwise return the earliest so something is still bookable.
  if (hintDate) {
    const byDate = candidates.find(
      (m) => formatMatchDateTime(m.datetimeIso)?.dateInputValue === hintDate,
    );
    if (byDate) return byDate;
  }
  return candidates
    .slice()
    .sort((a, b) => Date.parse(a.datetimeIso) - Date.parse(b.datetimeIso))[0];
}

export async function initBookingConcierge() {
  const form = document.querySelector("#booking-form");
  if (!form) return;
  if (form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  // Submit handler bound synchronously, before the async gate, so a
  // submit during the validation window can't trigger the browser's
  // default GET-reload. Short-circuits while `isReady` is false.
  let isReady = false;
  let isSubmitting = false;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!isReady || isSubmitting) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const lockButton = (text) => {
      if (!submitBtn) return;
      submitBtn.disabled = true;
      submitBtn.textContent = text;
      submitBtn.style.opacity = "0.7";
      submitBtn.style.cursor = "default";
    };

    if (!TALLY_FORM_ID) {
      console.error(
        "Booking: TALLY_FORM_ID not configured — aborting handoff.",
      );
      lockButton(`Bookings unavailable — call ${VENUE_PHONE_DISPLAY}`);
      return;
    }

    // Final guarantee: clamp guests into the zone range before handoff.
    // The live input cap covers typing, but Enter-to-submit (no blur),
    // an emptied field, or a below-min value can still reach here — Tally
    // must never receive an out-of-range count.
    clampGuestsInput();

    const fd = new FormData(e.target);
    const params = new URLSearchParams();
    for (const [k, v] of fd.entries()) {
      params.set(k, String(v));
    }

    isSubmitting = true;
    lockButton("Redirecting to verification…");

    window.location.assign(`${TALLY_URL_BASE}?${params.toString()}`);
  });

  const urlParams = new URLSearchParams(window.location.search);
  const fixtureParam = urlParams.get("fixture");
  const zoneParam = urlParams.get("zone");

  // Synchronous gate (param presence + zone validity) runs before any
  // fetch, so a bad URL bounces in the same tick as init — no form flash.
  if (!fixtureParam) {
    if (zoneParam && VALID_ZONES.has(zoneParam)) {
      redirectToFunnel(
        `fixtures.html?zone=${encodeURIComponent(zoneParam)}`,
        "Pick a match to continue your booking.",
      );
    } else {
      redirectToFunnel(
        "fixtures.html",
        "Pick a match to start your booking.",
      );
    }
    return;
  }

  if (!zoneParam || !VALID_ZONES.has(zoneParam)) {
    // Fixture present, zone missing/invalid — carry fixture context to
    // zones.html so it mounts its banner on arrival.
    const carry = new URLSearchParams();
    for (const k of ["fixture", "date", "time", "flagA", "flagB"]) {
      const v = urlParams.get(k);
      if (v) carry.set(k, v);
    }
    redirectToFunnel(
      `zones.html?${carry.toString()}`,
      "Pick a zone to continue your booking.",
    );
    return;
  }

  // Async validation: confirm the fixture still exists and is bookable.
  // Stale links redirect to fixtures.html with the zone preserved so the
  // user can re-pick a match without losing their zone choice.
  let matchData;
  try {
    matchData = await getMatchData();
  } catch (err) {
    console.warn("Booking: Data load failed.", err);
    redirectToFunnel(
      "fixtures.html",
      "Bookings are temporarily unavailable. Please try again.",
    );
    return;
  }

  if (
    !matchData ||
    matchData.status === "error" ||
    matchData.status === "concluded"
  ) {
    redirectToFunnel(
      "fixtures.html",
      matchData?.status === "concluded"
        ? "The 2026 tournament has concluded — see you next time."
        : "No bookable matches are available right now.",
    );
    return;
  }

  // Date hint disambiguates ambiguous slugs (TBD vs TBD shared across N
  // knockout fixtures). The URL's `date` param is the user's actual click
  // target — pass it so the lookup picks the right kickoff.
  const match = findBookableMatch(
    matchData,
    fixtureParam,
    urlParams.get("date"),
  );
  if (!match) {
    redirectToFunnel(
      `fixtures.html?zone=${encodeURIComponent(zoneParam)}`,
      "That match is no longer available — please pick another.",
    );
    return;
  }

  const fmt = formatMatchDateTime(match.datetimeIso);
  if (!fmt) {
    redirectToFunnel(
      "fixtures.html",
      "We couldn't load that match. Please pick another.",
    );
    return;
  }

  // All gates passed — populate the page, then unblock the submit handler.
  populateSummary(match, fmt, zoneParam);
  populateHiddenInputs(match, fmt, zoneParam);
  wireChangeLinks(match, fmt, fixtureParam, zoneParam);
  applyZoneGuestLimits(zoneParam); // before initStepper so it reads the range
  initStepper();
  isReady = true;
}

/**
 * Apply the zone's guest range to the stepper input. Booths carry a
 * group minimum (and a lower ceiling); bar + terrace take the standard
 * range. Clamps the starting value into range and surfaces a range note
 * only when the minimum exceeds a normal small-table party (2) — i.e.
 * for the booths — so the disabled "−" at that floor isn't a mystery.
 * Copy is generic so it stays correct for any zone, not just booths.
 */
function applyZoneGuestLimits(zoneSlug) {
  const input = document.getElementById("f-guests");
  const zone = ZONE_DATA[zoneSlug];
  if (!input || !zone) return;

  const min = Number.isFinite(zone.minGuests) ? zone.minGuests : 1;
  const max = Number.isFinite(zone.maxGuests) ? zone.maxGuests : 20;
  input.min = String(min);
  input.max = String(max);

  const current = parseInt(input.value, 10);
  if (!Number.isFinite(current) || current < min) input.value = String(min);
  else if (current > max) input.value = String(max);

  const note = document.getElementById("guests-note");
  if (note) {
    if (min > 2) {
      note.textContent = `Groups of ${min}–${max} guests.`;
      note.removeAttribute("hidden");
    } else {
      note.setAttribute("hidden", "");
    }
  }
}

/**
 * Force #f-guests into its [min, max] range (read from the attributes
 * applyZoneGuestLimits set). Shared by the stepper blur handler and the
 * submit safety net so the clamp logic lives in exactly one place.
 */
function clampGuestsInput() {
  const input = document.getElementById("f-guests");
  if (!input) return;
  const parsedMin = parseInt(input.min, 10);
  const parsedMax = parseInt(input.max, 10);
  const lo = Number.isFinite(parsedMin) ? parsedMin : 1;
  const hi = Number.isFinite(parsedMax) ? parsedMax : 20;
  let n = parseInt(input.value, 10);
  if (!Number.isFinite(n) || n < lo) n = lo;
  else if (n > hi) n = hi;
  input.value = String(n);
}

/**
 * Reveal + populate the locked match/zone summary. Elements stay hidden
 * until this runs so users never see a half-loaded card.
 */
function populateSummary(match, fmt, zoneSlug) {
  const summary = document.getElementById("booking-summary");
  const titleEl = document.getElementById("summary-title");
  const metaEl = document.getElementById("summary-meta");
  const flagA = document.getElementById("summary-flag-a");
  const flagB = document.getElementById("summary-flag-b");
  const snapshot = document.getElementById("zone-snapshot");
  const snapshotImg = document.getElementById("zone-snapshot-img");
  const snapshotLabel = document.getElementById("zone-snapshot-label");
  const policy = document.getElementById("match-policy");
  const zoneInfo = ZONE_DATA[zoneSlug];

  // "No confirmed teams yet" drives both the title fallback (stage label
  // instead of "TBD VS TBD") and the flag treatment (trophy emblem).
  const isAnonymous = isAnonymousMatch(match);

  if (summary) {
    summary.removeAttribute("hidden");
    summary.classList.toggle("c-booking-summary--milestone", isAnonymous);
  }
  if (snapshot) snapshot.removeAttribute("hidden");
  if (policy) policy.removeAttribute("hidden");

  if (titleEl) {
    if (isAnonymous) {
      const stageLabel = getDetailedStageLabel(match);
      titleEl.textContent = stageLabel || "KNOCKOUT MATCH";
    } else {
      const nameA = safe(match.teamA?.name).trim() || "TBD";
      const nameB = safe(match.teamB?.name).trim() || "TBD";
      titleEl.textContent = `${nameA} VS ${nameB}`;
    }
  }

  if (metaEl) {
    metaEl.textContent = [fmt.dateShort, fmt.time].filter(Boolean).join(" · ");
  }

  if (isAnonymous) {
    // Flag A hosts a trophy emblem in-line with the title; flag B hides.
    // Overwriting flagA's innerHTML wholesale keeps this idempotent.
    if (flagA) {
      flagA.style.backgroundImage = "";
      flagA.classList.add("c-booking-summary__flag-trophy");
      flagA.innerHTML = TROPHY_SVG_MARKUP;
    }
    if (flagB) flagB.style.display = "none";
  } else {
    // Restore standard flags — clears any prior milestone-mode state so
    // a confirmed-team match re-renders cleanly on hot reload.
    if (flagA) {
      flagA.classList.remove("c-booking-summary__flag-trophy");
      flagA.innerHTML = "";
      flagA.style.display = "";
      flagA.style.backgroundImage = safeBackgroundUrl(match.teamA?.flag);
    }
    if (flagB) {
      flagB.style.display = "";
      flagB.style.backgroundImage = safeBackgroundUrl(match.teamB?.flag);
    }
  }

  if (snapshotImg && zoneInfo) {
    // onerror bound before src (race-safe).
    snapshotImg.onerror = () => {
      snapshotImg.style.display = "none";
      if (snapshot) snapshot.classList.add("c-zone-snapshot--failed");
    };
    snapshotImg.src = zoneInfo.img;
    snapshotImg.alt = zoneInfo.name;
  }
  if (snapshotLabel && zoneInfo) {
    snapshotLabel.textContent = zoneInfo.name;
  }
}

/**
 * Write the four URL-sourced values into their hidden inputs so the form
 * submit handler can forward them via FormData → Tally. `guests` is
 * owned by the stepper and left untouched.
 *
 * Slugs are routing primitives; this boundary substitutes human-readable
 * display values for the email + Sheets row:
 *   fixture → formatFixtureDisplay(match)  ("England vs Brazil")
 *   zone    → ZONE_DATA[zoneSlug].name     ("Carbon", not "carbon")
 */
function populateHiddenInputs(match, fmt, zoneSlug) {
  const setInput = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  setInput("f-fixture", formatFixtureDisplay(match));
  setInput("f-date", fmt.dateInputValue);
  setInput("f-time", fmt.time);
  setInput("f-zone", ZONE_DATA[zoneSlug]?.name || zoneSlug);
}

/** Wire "Change match" / "Change zone" so the user can re-pick either
 *  field without losing the other. */
function wireChangeLinks(match, fmt, fixtureSlug, zoneSlug) {
  const changeMatch = document.getElementById("summary-change-match");
  if (changeMatch) {
    changeMatch.href = `fixtures.html?zone=${encodeURIComponent(zoneSlug)}`;
  }

  const changeZone = document.getElementById("summary-change-zone");
  if (changeZone) {
    const params = new URLSearchParams({
      fixture: fixtureSlug,
      date: fmt.dateInputValue,
      time: fmt.time,
      flagA: safe(match.teamA?.flag),
      flagB: safe(match.teamB?.flag),
    });
    changeZone.href = `zones.html?${params.toString()}`;
  }
}

/**
 * Guest-count stepper — the only interactive control on this page.
 * Clamps to min/max on blur, strips non-digits while typing, selects on
 * focus. A funnel-cue highlight clears on first interaction.
 */
function initStepper() {
  const stepper = document.querySelector('[data-component="stepper"]');
  if (!stepper) return;

  const stepInput = stepper.querySelector("input");
  if (!stepInput) return;
  const stepBtns = stepper.querySelectorAll("[data-step]");

  // Number.isFinite so a legitimate min="0" doesn't collapse via `|| 1`.
  const parsedMin = parseInt(stepInput.min, 10);
  const parsedMax = parseInt(stepInput.max, 10);
  const stepMin = Number.isFinite(parsedMin) ? parsedMin : 1;
  const stepMax = Number.isFinite(parsedMax) ? parsedMax : 20;

  // Overflow affordance — surfaced only at the ceiling, for any zone.
  const maxNote = document.getElementById("guests-max-note");

  const syncStepperDisabled = () => {
    const current = parseInt(stepInput.value, 10) || stepMin;
    stepBtns.forEach((btn) => {
      const delta = parseInt(btn.dataset.step, 10);
      const next = current + delta;
      btn.disabled = next < stepMin || next > stepMax;
    });
    if (maxNote) maxNote.toggleAttribute("hidden", current < stepMax);
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

  // Strip non-digits and cap the MAX live so the field can never display
  // a number the user can't actually book (prevents "typed 50, booked
  // 20" surprises). The MIN is left to blur so they can clear and retype
  // through intermediate states like "". Hitting the cap reveals the
  // "Larger group?" note via syncStepperDisabled, so the limit explains
  // itself.
  stepInput.addEventListener("input", () => {
    let cleaned = stepInput.value.replace(/\D/g, "");
    if (cleaned !== "") {
      const n = parseInt(cleaned, 10);
      if (Number.isFinite(n) && n > stepMax) cleaned = String(stepMax);
    }
    if (cleaned !== stepInput.value) stepInput.value = cleaned;
    syncStepperDisabled();
  });

  // On blur, clamp to min/max (empty / sub-min → min, over-max → max).
  // Deferred to blur so mid-edit intermediate states aren't autocorrected.
  stepInput.addEventListener("blur", () => {
    const before = stepInput.value;
    clampGuestsInput();
    if (stepInput.value !== before) {
      stepInput.dispatchEvent(new Event("change", { bubbles: true }));
      syncStepperDisabled();
    }
  });

  stepInput.addEventListener("focus", () => stepInput.select());

  // Funnel cue: guests is the only remaining input. Subtle highlight
  // auto-clears on first focus so it never lingers.
  stepper.classList.add("c-stepper--highlight");
  stepper.addEventListener(
    "focusin",
    () => stepper.classList.remove("c-stepper--highlight"),
    { once: true },
  );

  syncStepperDisabled();
}

