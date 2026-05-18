import {
  getMatchData,
  formatMatchDateTime,
  getDetailedStageLabel,
} from "../lib/matchData.js";
import { safeBackgroundUrl } from "../lib/urlHelpers.js";

const IMG = new URL("../../img/", import.meta.url).href;

const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "The Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booths", img: `${IMG}booth-thumb.webp` },
};
const VALID_ZONES = new Set(Object.keys(ZONE_DATA));

/* -------------------------------------------------------------------------
   TALLY HANDOFF
   The booking funnel exits the SPA at submit-time. Five captured metrics
   ride into the live Tally form as case-sensitive URL params:
       fixture, date, time, zone, guests
   Tally collects name/email/phone, fires a double opt-in verification
   email, and on confirmation a server webhook commits the row to the
   Google Sheets ledger + dispatches the Brevo voucher email.

   The form field `name=""` attributes on book.html are intentionally
   identical to the Tally hidden-field names so the submit handler can
   forward FormData → URLSearchParams without any renaming layer.
   ------------------------------------------------------------------------- */
const TALLY_FORM_ID = "9qRELY";
const TALLY_URL_BASE = `https://tally.so/r/${TALLY_FORM_ID}`;
const VENUE_PHONE_DISPLAY = "01449 674674";

/* -------------------------------------------------------------------------
   FUNNEL GATE
   book.html is the funnel terminal — it cannot serve a useful UI without
   both fixture and zone context. When either is missing or invalid, the
   gate redirects the user back to the appropriate step.

   A hint string is stashed in sessionStorage so the destination page can
   surface a brief "Pick a match to continue your booking" cue (Phase 5
   will wire the display layer; the write is harmless until then).
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
  // `replace` (not `assign`) so the back button doesn't sandwich the user
  // in a redirect chain. They land on fixtures.html / zones.html and the
  // browser history has no book.html step between the previous page and
  // the destination.
  window.location.replace(destination);
}

/**
 * Find a still-bookable match in matchData whose team slug matches
 * `fixtureSlug`. Uses the same normalization as urlHelpers.buildMatchURL
 * so URLs emitted by fixtures/zones pages round-trip cleanly. Returns
 * `null` for stale links (passed fixture / withdrawn fixture / inside
 * the 3-hour cut-off).
 */
function findBookableMatch(matchData, fixtureSlug) {
  if (!fixtureSlug || !matchData) return null;
  const norm = fixtureSlug.toLowerCase();
  const pool = [
    ...(Array.isArray(matchData.england) ? matchData.england : []),
    ...(Array.isArray(matchData.upcoming) ? matchData.upcoming : []),
  ].filter((m) => m?.isBookable);
  return (
    pool.find((m) => {
      const slug = `${m.teamA?.name || ""}-vs-${m.teamB?.name || ""}`
        .toLowerCase()
        .replace(/\s+/g, "-");
      return slug === norm;
    }) || null
  );
}

export async function initBookingConcierge() {
  const form = document.querySelector("#booking-form");
  if (!form) return;
  if (form.dataset.initialized === "true") return;
  form.dataset.initialized = "true";

  /* -----------------------------------------------------------------------
      SUBMIT HANDLER — bound SYNCHRONOUSLY
      Attached before the async gate so any submit attempts during the
      matchData fetch window are intercepted. Without this, the browser's
      default form submission would fire (GET-reload to the same URL with
      form fields appended) when a user clicks submit during the ~50-500ms
      validation window. The handler short-circuits while `isReady` is
      false; once population completes, the next submit succeeds.
      ----------------------------------------------------------------------- */
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

  /* -----------------------------------------------------------------------
      SYNCHRONOUS GATE — param presence + zone validity
      Runs before any data fetch so a bad URL is bounced in the same tick
      as init, eliminating the form-flash window.
      ----------------------------------------------------------------------- */
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
    // Fixture is present, zone is missing or invalid. Carry the full
    // fixture context forward so zones.html mounts its banner on arrival.
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

  /* -----------------------------------------------------------------------
      ASYNC VALIDATION — confirm the fixture still exists and is bookable
      Stale bookmarks (passed fixture, withdrawn fixture, inside 3-hour
      cut-off) redirect to fixtures.html with the zone preserved so the
      user can pick another match without losing their zone choice.
      ----------------------------------------------------------------------- */
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
      "No bookable matches are available right now.",
    );
    return;
  }

  const match = findBookableMatch(matchData, fixtureParam);
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

  /* -----------------------------------------------------------------------
      ALL GATES PASSED — populate the page
      ----------------------------------------------------------------------- */
  populateSummary(match, fmt, zoneParam);
  populateHiddenInputs(fixtureParam, fmt, zoneParam);
  wireChangeLinks(match, fmt, fixtureParam, zoneParam);
  initStepper();

  // Last step — unblocks the sync submit handler attached at the top.
  isReady = true;
}

/**
 * Reveal and populate the locked match + zone summary panel. Hidden
 * elements stay hidden until this runs so users never see an empty or
 * half-loaded card.
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

  if (summary) summary.removeAttribute("hidden");
  if (snapshot) snapshot.removeAttribute("hidden");
  if (policy) policy.removeAttribute("hidden");

  if (titleEl) {
    const nameA = safe(match.teamA?.name).trim() || "TBD";
    const nameB = safe(match.teamB?.name).trim() || "TBD";
    const slug = `${nameA} VS ${nameB}`;
    // Anonymous knockout fixtures (TBD vs TBD) surface the milestone label
    // ("WORLD CUP FINAL") instead of a confusing slug.
    const isAnonymous = nameA === "TBD" && nameB === "TBD";
    const stageLabel = getDetailedStageLabel(match);
    titleEl.textContent = isAnonymous && stageLabel ? stageLabel : slug;
  }

  if (metaEl) {
    metaEl.textContent = [fmt.dateShort, fmt.time].filter(Boolean).join(" · ");
  }

  if (flagA) flagA.style.backgroundImage = safeBackgroundUrl(match.teamA?.flag);
  if (flagB) flagB.style.backgroundImage = safeBackgroundUrl(match.teamB?.flag);

  if (snapshotImg && zoneInfo) {
    // onerror bound BEFORE src (race-safe). The zone is locked on this
    // page so the image only loads once — no token guard needed.
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
 * submit handler can forward them via FormData. The fifth field (guests)
 * is owned by the stepper and is left untouched.
 */
function populateHiddenInputs(fixtureSlug, fmt, zoneSlug) {
  const setInput = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.value = value;
  };
  setInput("f-fixture", fixtureSlug);
  setInput("f-date", fmt.dateInputValue);
  setInput("f-time", fmt.time);
  setInput("f-zone", zoneSlug);
}

/**
 * Wire the two "Change match" / "Change zone" affordances so the user can
 * re-pick either field without losing the other. Mirrors the carry shape
 * produced by urlHelpers.buildMatchURL.
 */
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
 * Guest-count stepper — the only interactive control on this page. Clamps
 * to min/max on blur, strips non-digits during typing, and selects on
 * focus so the first keypress replaces the value. The funnel-cue highlight
 * draws attention to the single remaining field and clears on first
 * interaction.
 */
function initStepper() {
  const stepper = document.querySelector('[data-component="stepper"]');
  if (!stepper) return;

  const stepInput = stepper.querySelector("input");
  if (!stepInput) return;
  const stepBtns = stepper.querySelectorAll("[data-step]");

  // `Number.isFinite` so a legitimate `min="0"` doesn't collapse to the
  // fallback (the falsy 0 would have under `|| 1`).
  const parsedMin = parseInt(stepInput.min, 10);
  const parsedMax = parseInt(stepInput.max, 10);
  const stepMin = Number.isFinite(parsedMin) ? parsedMin : 1;
  const stepMax = Number.isFinite(parsedMax) ? parsedMax : 20;

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

  // Strip non-digits as the user types but don't clamp yet (so they can
  // transition through invalid intermediate states like "").
  stepInput.addEventListener("input", () => {
    const cleaned = stepInput.value.replace(/\D/g, "");
    if (cleaned !== stepInput.value) stepInput.value = cleaned;
    syncStepperDisabled();
  });

  // On blur, clamp to min/max. Empty / sub-min snaps to min; over-max
  // snaps to max. Avoids hostile mid-edit autocorrect.
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

