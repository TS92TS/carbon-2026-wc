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

  /* -----------------------------------------------------------------------
      ALL GATES PASSED — populate the page
      ----------------------------------------------------------------------- */
  populateSummary(match, fmt, zoneParam);
  populateHiddenInputs(match, fmt, zoneParam);
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

  // Single source of truth for "no confirmed teams yet" — drives both
  // the title fallback (stage label instead of "TBD VS TBD") AND the
  // flag treatment (trophy emblem replaces the two empty grey flag
  // rectangles that would otherwise frame the title).
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
    // Replace the two empty flag boxes with a single trophy emblem
    // inserted in-line with the title. Flag A becomes the emblem host
    // (preserves DOM order: emblem · title · [hidden]); flag B is
    // hidden via display:none. Idempotent — re-running populateSummary
    // on the same anonymous match won't double-insert because we
    // overwrite flagA's innerHTML wholesale.
    if (flagA) {
      flagA.style.backgroundImage = "";
      flagA.classList.add("c-booking-summary__flag-trophy");
      flagA.innerHTML = TROPHY_SVG_MARKUP;
    }
    if (flagB) flagB.style.display = "none";
  } else {
    // Restore standard flag rendering — explicit "" clears any prior
    // milestone-mode display:none so the same elements can re-render
    // for a confirmed-team match on a hot reload.
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
 * submit handler can forward them via FormData → Tally. The fifth field
 * (guests) is owned by the stepper and is left untouched.
 *
 * IMPORTANT — display values, not slugs.
 * The URL slug (e.g. `england-vs-brazil`, `tbd-vs-tbd`) and the zone
 * slug (`carbon`/`terrace`/`booth`) are routing/normalisation primitives
 * — they need to stay machine-parseable for `findBookableMatch`, the
 * cross-page funnel URLs, and for matchData lookups. But the moment the
 * form is submitted, the payload is one-way: it lands in a confirmation
 * email and a Google Sheets row that humans (the customer and the
 * venue) will read.
 *
 * So at this boundary we substitute:
 *   `fixture` → `formatFixtureDisplay(match)`  →  "World Cup Final"
 *                                                or "England vs Brazil"
 *   `zone`    → `ZONE_DATA[zoneSlug].name`     →  "Main Bar" (not "carbon")
 *
 * The URL flow, the booking gate, and the in-page summary remain
 * unchanged. Once a TBD knockout's teams are confirmed by the API,
 * subsequent bookings automatically pick up the new team-pair display
 * without any code change here.
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

