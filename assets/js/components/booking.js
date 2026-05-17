import {
  getMatchData,
  formatMatchDateTime,
  getDetailedStageLabel,
  isMilestoneMatch,
} from "../lib/matchData.js";
import { safeBackgroundUrl } from "../lib/urlHelpers.js";

const IMG = new URL("../../img/", import.meta.url).href;

const ZONE_DATA = {
  carbon: { name: "Main Bar", img: `${IMG}carbon-thumb.webp` },
  terrace: { name: "The Mill Terrace", img: `${IMG}terrace-thumb.webp` },
  booth: { name: "VIP Booths", img: `${IMG}booth-thumb.webp` },
};

/* -------------------------------------------------------------------------
   TALLY HANDOFF
   The booking funnel exits the SPA at submit-time: the five captured
   metrics (fixture slug, stage label, zone, date, time, guests) ride as
   URL params into a Tally.so form. Tally collects name/email/phone, fires
   a double opt-in verification email, and on confirmation a webhook
   commits the row to the Google Sheets ledger + dispatches the Brevo
   voucher email.

   TALLY_FORM_ID must be swapped for the production form ID before launch.
   While it remains the placeholder, the submit handler refuses to redirect
   and surfaces a phone-call fallback so a config gap never silently drops
   a booking the way the previous stub did.
   ------------------------------------------------------------------------- */
const TALLY_FORM_ID = "YOUR_FORM_ID";
const TALLY_URL_BASE = `https://tally.so/r/${TALLY_FORM_ID}`;
const VENUE_PHONE_DISPLAY = "01449 674674";

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
    changeZone: document.querySelector("#summary-change-zone"),
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
    if (els.summaryTitle) {
      // Anonymous fixtures (knockout brackets with TBD teams) surface the
      // tournament milestone as the headline instead of "TBD VS TBD" — the
      // round name IS the product for these high-value bookings.
      const slugUpper = (info.slug || "").toUpperCase();
      const isAnonymous =
        slugUpper === "TBD VS TBD" ||
        slugUpper.startsWith("TBD VS ") ||
        slugUpper.endsWith(" VS TBD") ||
        slugUpper === " VS ";
      els.summaryTitle.textContent =
        isAnonymous && info.stageLabel ? info.stageLabel : slugUpper;
    }
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

  // Monotonic load token — when the user switches zones rapidly, the
  // browser may fire `error` on the ABORTED previous src. Without this
  // guard, that stale event would hide the now-loading new image and
  // briefly flash the --failed state. Each updateZoneUI call mints a
  // fresh token; the onerror closure compares its captured token against
  // the latest issued one and bails if it's been superseded.
  let snapshotLoadToken = 0;

  const updateZoneUI = (zoneValue) => {
    const data = ZONE_DATA[zoneValue];
    if (!data) return;
    showSummary();

    if (els.snapshot) {
      els.snapshot.removeAttribute("hidden");
      els.snapshot.classList.remove("c-zone-snapshot--failed"); // Reset previous failure state
    }

    if (els.snapshotImg) {
      // Clear layout overrides to prepare for a clean hot swap
      els.snapshotImg.style.display = "";

      const myToken = ++snapshotLoadToken;

      // DEFENSIVE BIND: Attach the asset fault interceptor BEFORE assigning
      // the source path. Token check shields the engine from the aborted-
      // previous-load race when the user toggles zones rapidly.
      els.snapshotImg.onerror = () => {
        if (myToken !== snapshotLoadToken) return; // superseded — ignore
        els.snapshotImg.style.display = "none";
        if (els.snapshot) {
          els.snapshot.classList.add("c-zone-snapshot--failed");
        }
      };

      els.snapshotImg.src = data.img;
      els.snapshotImg.alt = data.name;
    }

    if (els.snapshotLabel) {
      els.snapshotLabel.textContent = data.name;
    }
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
   * Keeps the "Change zone" link pointing at zones.html with the current
   * fixture context attached, so users who want to revisit zones don't lose
   * their match selection. Mirrors the shape produced by urlHelpers'
   * `buildZonesURL` without re-importing match objects we no longer hold.
   */
  const syncChangeZoneHref = (info) => {
    if (!els.changeZone || !info) return;
    const slug = (info.slug || "").toLowerCase().replace(/\s+/g, "-");
    const params = new URLSearchParams({
      fixture: slug,
      date: info.date || "",
      time: info.time || "",
      flagA: info.flagA || "",
      flagB: info.flagB || "",
    });
    els.changeZone.href = `zones.html?${params.toString()}`;
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
    // Resolve anonymous knockout payloads to "TBD" so the slug never
    // collapses into an empty " vs " string.
    const nameA = safe(match.teamA?.name).trim() || "TBD";
    const nameB = safe(match.teamB?.name).trim() || "TBD";
    const info = {
      slug: `${nameA} vs ${nameB}`,
      date: fmt.dateInputValue,
      time: fmt.time,
      dateLabel: fmt.dateShort,
      stageLabel: getDetailedStageLabel(match),
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
    syncChangeZoneHref(info);
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
    // `|| fallback` collapses legitimate 0 / negative bounds to the fallback
    // because they're falsy. Use Number.isFinite so a future "0–20" stepper
    // (e.g. drinks-only walk-ins) still behaves correctly.
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

  // Zone change handler — wired in the SYNCHRONOUS bootstrap (before the
  // `await getMatchData()` below) so a user who picks a zone during the
  // "Loading fixtures..." window still triggers the snapshot update. The
  // zone <select> is fully populated in HTML and interactive from first
  // paint, unlike the match <select> which only opens after the fetch.
  if (els.zone) {
    els.zone.addEventListener("change", (e) => updateZoneUI(e.target.value));
  }

  /* -----------------------------------------------------------------------
      SUBMIT HANDLER — TALLY HANDOFF
      The form has no `action` attribute, so the browser's default is a GET
      reload that would overwrite the URL with form fields and re-init the
      page mid-flow. `e.preventDefault()` halts that, we serialise the five
      captured metrics, and we redirect to Tally for contact-detail capture
      + the double opt-in verification gate.

      Native HTML5 `required` validation runs BEFORE this handler fires, so
      by the time we get here all five fields are populated. The
      `isSubmitting` latch absorbs a double-tap during the brief window
      between click and navigation.
      ----------------------------------------------------------------------- */
  let isSubmitting = false;
  els.form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const lockButton = (text) => {
      if (!submitBtn) return;
      submitBtn.disabled = true;
      submitBtn.textContent = text;
      submitBtn.style.opacity = "0.7";
      submitBtn.style.cursor = "default";
    };

    // Config guard — if the Tally form ID hasn't been wired, surface a
    // recoverable path (phone the venue) rather than silently dropping
    // the booking the way the legacy stub did.
    if (!TALLY_FORM_ID || TALLY_FORM_ID === "YOUR_FORM_ID") {
      console.error(
        "Booking: TALLY_FORM_ID not configured — aborting handoff.",
      );
      lockButton(`Bookings unavailable — call ${VENUE_PHONE_DISPLAY}`);
      return;
    }

    const fd = new FormData(e.target);
    const params = new URLSearchParams();

    // Match — JSON-encoded inside the <option value="…">. Extract the
    // slug + stageLabel for Tally; the date/time are already separately
    // captured by the locked form inputs and ride as their own params.
    try {
      const matchValue = fd.get("match");
      if (matchValue) {
        const matchInfo = JSON.parse(matchValue);
        params.set("fixture", matchInfo.slug || "");
        params.set("stageLabel", matchInfo.stageLabel || "");
      }
    } catch (parseErr) {
      console.warn("Booking: match JSON parse failed", parseErr);
    }

    // Zone — machine slug for the ledger, friendly name for the voucher email
    const zoneSlug = String(fd.get("zone") || "");
    params.set("zone", zoneSlug);
    params.set("zoneName", ZONE_DATA[zoneSlug]?.name || zoneSlug);

    // Logistics — stepper-clamped, form-validated
    params.set("date", String(fd.get("date") || ""));
    params.set("time", String(fd.get("time") || ""));
    params.set("guests", String(fd.get("guests") || ""));

    isSubmitting = true;
    lockButton("Redirecting to verification…");

    // Hand off to Tally. The user completes contact details there; Tally
    // fires the double opt-in email; the verification webhook commits the
    // row to Sheets and dispatches the Brevo voucher.
    window.location.assign(`${TALLY_URL_BASE}?${params.toString()}`);
  });

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

  /**
   * Build a single <option> element for the match dropdown.
   * Accepts an explicit `seenSlugs` Set so Path B rebuilds can start with a
   * fresh dedup namespace without sharing state with the initial render.
   *
   * For anonymous knockout fixtures (TBD teams), the visible label switches
   * to the tournament milestone — "WORLD CUP FINAL — Sun 19 Jul · 20:00"
   * — so users never see a confusing "TBD v TBD" row. The JSON value's
   * `slug` stays "TBD vs TBD" (or "TBD vs <name>") for downstream symmetry
   * with applyCanonicalMatch's URL-arrival path.
   */
  const createOption = (m, seenSlugs) => {
    const fmt = formatMatchDateTime(m?.datetimeIso);
    if (!fmt) return null;

    const nameA = safe(m.teamA?.name).trim();
    const nameB = safe(m.teamB?.name).trim();
    const isAnonymous = nameA === "" && nameB === "";
    const teamA = isAnonymous ? "TBD" : nameA || "TBD";
    const teamB = isAnonymous ? "TBD" : nameB || "TBD";
    const slug = `${teamA} vs ${teamB}`;
    const stageLabel = getDetailedStageLabel(m);

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
    // user just read in the option label. `stageLabel` rides along so the
    // summary panel can swap "TBD VS TBD" for "WORLD CUP FINAL" on select.
    opt.value = JSON.stringify({
      slug,
      date: fmt.dateInputValue,
      time: fmt.time,
      dateLabel: fmt.dateShort,
      stageLabel,
      flagA: safe(m.teamA?.flag),
      flagB: safe(m.teamB?.flag),
    });

    // Anonymous fixtures: lead with the milestone label, not "TBD v TBD".
    opt.textContent = isAnonymous
      ? `${stageLabel} — ${fmt.dateShort} · ${fmt.time}`
      : `${teamA} v ${teamB} — ${fmt.dateShort} · ${fmt.time}`;

    // NOTE: Auto-selecting here on slug-only match would pick the wrong
    // option in the rematch case (group + KO with identical teams).
    // Selection is performed centrally in applyCanonicalMatch using the full
    // canonical value (slug + date + time), guaranteeing dropdown text and
    // form values agree.
    return opt;
  };

  /* -----------------------------------------------------------------------
      PATH A — INTENT-CURATED DROPDOWN (ALL-INCLUSIVE ARCHITECTURE)
      Hick's Law & Cognitive Chunking: Caps the immediate priority surface 
      to high-yield entries while exposing the complete remaining bookable 
      dataset within clear structural sub-buckets. 
      
      Deduplication relies on invariant match IDs to completely insulate the
      funnel from simultaneous kickoff data-loss vulnerabilities.
      ----------------------------------------------------------------------- */
  const ENGLAND_PRIORITY_LIMIT = 5;

  const seenSlugs = new Set();
  const fragment = document.createDocumentFragment();

  const allUpcoming = Array.isArray(matchData?.upcoming)
    ? matchData.upcoming
    : [];
  const allEngland = Array.isArray(matchData?.england) ? matchData.england : [];

  const byKickoff = (a, b) =>
    Date.parse(a.datetimeIso) - Date.parse(b.datetimeIso);

  // 1. Segment England Group/Early bracket entries
  const englandPriorityList = allEngland
    .filter((m) => m?.isBookable && !isMilestoneMatch(m))
    .sort(byKickoff)
    .slice(0, ENGLAND_PRIORITY_LIMIT);

  // 2. Segment High-Atmosphere Knockout brackets (R16 through to Final)
  const milestoneList = allUpcoming
    .filter((m) => m?.isBookable && isMilestoneMatch(m))
    .sort(byKickoff);

  // 3. Map secure key namespaces using canonical IDs to guarantee no data overlaps
  const prioritizedMatchIds = new Set([
    ...englandPriorityList.map((m) => m.id),
    ...milestoneList.map((m) => m.id),
  ]);

  // 4. Capture every remaining group-stage match chronologically without artificial drops
  const allOtherList = allUpcoming
    .filter((m) => m?.isBookable && !prioritizedMatchIds.has(m.id))
    .sort(byKickoff);

  // Render Category Optgroups
  if (englandPriorityList.length > 0 && els.match) {
    const engGroup = document.createElement("optgroup");
    engGroup.label = ">> ENGLAND PRIORITY ROAD";
    englandPriorityList.forEach((m) => {
      const opt = createOption(m, seenSlugs);
      if (opt) engGroup.appendChild(opt);
    });
    if (engGroup.children.length > 0) fragment.appendChild(engGroup);
  }

  if (milestoneList.length > 0 && els.match) {
    const milestoneGroup = document.createElement("optgroup");
    milestoneGroup.label = ">> MAJOR TOURNAMENT MILESTONES";
    milestoneList.forEach((m) => {
      const opt = createOption(m, seenSlugs);
      if (opt) milestoneGroup.appendChild(opt);
    });
    if (milestoneGroup.children.length > 0)
      fragment.appendChild(milestoneGroup);
  }

  if (allOtherList.length > 0 && els.match) {
    const allGroup = document.createElement("optgroup");
    allGroup.label = ">> ALL UPCOMING FIXTURES";
    allOtherList.forEach((m) => {
      const opt = createOption(m, seenSlugs);
      if (opt) allGroup.appendChild(opt);
    });
    if (allGroup.children.length > 0) fragment.appendChild(allGroup);
  }

  // Closure-scoped cache of the intent-curated fragment so Path B's
  // date-clear branch can restore the original optgroup tree without
  // re-running the build pipeline. Cloned BEFORE the initial append
  // because appendChild moves the fragment's children into the <select>.
  let initialMatchDropdownFragment = null;

  if (els.match) {
    // Empty-optgroup escape hatch: if every bookable filter turns up empty
    // (e.g. final hours of the tournament, every remaining kickoff inside
    // the 3-hour cut-off), surface a recoverable phone CTA INSIDE the
    // dropdown so the user isn't left staring at a <select> they can't
    // expand. The option stays disabled — the form still cannot submit in
    // this state, but the user now has a clear next step.
    if (fragment.childElementCount === 0) {
      const fallbackOpt = document.createElement("option");
      fallbackOpt.value = "";
      fallbackOpt.disabled = true;
      fallbackOpt.textContent = `No bookable fixtures — call ${VENUE_PHONE_DISPLAY} for walk-ins`;
      fragment.appendChild(fallbackOpt);
    }

    // Single disabled+hidden placeholder — the dropdown is required, so the
    // user must pick a real fixture. No "general booking" escape hatch:
    // every reservation must be bound to a specific kickoff.
    els.match.innerHTML =
      '<option value="" disabled selected hidden>Select your match...</option>';

    initialMatchDropdownFragment = fragment.cloneNode(true);
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
    // Pool intentionally filters to bookable matches only. A stale link
    // like ?fixture=…&date=… opened inside the 3-hour cut-off resolves to
    // null here, which short-circuits applyCanonicalMatch and leaves the
    // form in its default empty state — the user can still pick another
    // (bookable) fixture from the dropdown.
    const pool = [
      ...(Array.isArray(data.england) ? data.england : []),
      ...(Array.isArray(data.upcoming) ? data.upcoming : []),
    ].filter((m) => m?.isBookable);
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
        syncChangeZoneHref(info);
        lockDateTime();
      } catch (err) {
        console.warn("Booking: Failed to parse match selection", err);
      }
    });
  }

  /* -----------------------------------------------------------------------
      PATH B — CALENDAR INTERCEPTION
      A user who picks a date BEFORE selecting a match enters via lifestyle
      intent ("I'm free on Saturday"). We rebuild the match dropdown to
      show only the 2-3 bookable fixtures broadcasting on that evening,
      with an auto-select when only one match qualifies.

      Path B only triggers while #f-date is editable. Once a match locks
      the date (lockDateTime sets readonly), this handler bails — match
      selection then drives the date, not the other way around.

      The rebuild creates its OWN seenSlugs Set so the dedup namespace
      doesn't collide with the initial intent-curated render.
      ----------------------------------------------------------------------- */
  if (els.date && els.match) {
    els.date.addEventListener("change", (e) => {
      // Gate: skip when a match has already locked the date input.
      if (els.date.readOnly) return;

      const pickedDate = e.target.value;

      // Date cleared → restore the original intent-curated optgroup tree.
      // Without this, a user who cleared an accidentally-picked date would
      // be left with whatever the previous date-filter built (often a
      // single-match list or a "No bookable matches" dead-end) and would
      // need a page reload to recover.
      if (!pickedDate) {
        if (initialMatchDropdownFragment) {
          els.match.innerHTML =
            '<option value="" disabled selected hidden>Select your match...</option>';
          els.match.appendChild(initialMatchDropdownFragment.cloneNode(true));
        }
        return;
      }

      const dateMatches = (
        Array.isArray(matchData?.upcoming) ? matchData.upcoming : []
      )
        .filter((m) => {
          if (!m?.isBookable) return false;
          const fmt = formatMatchDateTime(m.datetimeIso);
          return fmt && fmt.dateInputValue === pickedDate;
        })
        .sort(byKickoff);

      // Rebuild the dropdown from scratch with a fresh dedup set.
      const dateSeenSlugs = new Set();
      const dateFragment = document.createDocumentFragment();

      els.match.innerHTML =
        '<option value="" disabled selected hidden>Select your match...</option>';

      if (dateMatches.length === 0) {
        // No bookable matches on this date — surface the dead-end clearly
        // rather than leaving the dropdown silently empty.
        const noOpt = document.createElement("option");
        noOpt.value = "";
        noOpt.disabled = true;
        const fmt = formatMatchDateTime(`${pickedDate}T12:00:00Z`);
        const label = fmt ? fmt.dateShort : pickedDate;
        noOpt.textContent = `No bookable matches on ${label}`;
        dateFragment.appendChild(noOpt);
      } else {
        dateMatches.forEach((m) => {
          const opt = createOption(m, dateSeenSlugs);
          if (opt) dateFragment.appendChild(opt);
        });
      }

      els.match.appendChild(dateFragment);

      // Auto-select when exactly one match is available — saves a tap and
      // surfaces the form-completion path immediately. dispatchEvent fires
      // the match change handler above, which writes date/time + locks.
      if (dateMatches.length === 1) {
        const onlyOpt = els.match.querySelector(
          "option[value]:not([disabled])",
        );
        if (onlyOpt) {
          onlyOpt.selected = true;
          els.match.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
  }
}
