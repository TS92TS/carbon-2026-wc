/* =========================================================================
   URL HELPERS · funnel routing + CSS-safe background URLs
   ========================================================================= */

import { formatMatchDateTime } from "./matchData.js";

/**
 * Build a `<baseUrl>?fixture=…&date=…&time=…&flagA=…&flagB=…` URL.
 * Date/time are emitted in Europe/London — they populate the booking
 * form's date/time inputs directly so they must match what the user saw
 * in the feed. `extras` is spread after the base params so callers can
 * fold in additive context (e.g. `{ zone }`).
 */
function buildMatchURL(baseUrl, match, extras = {}) {
  if (!match || !match.datetimeIso) return baseUrl;

  const fmt = formatMatchDateTime(match.datetimeIso);
  if (!fmt) return baseUrl;

  // Trim before slugifying so this stays byte-identical to the slug
  // re-match in booking.js findBookableMatch — a stray leading/trailing
  // space in an API team name must not desync the two.
  const teamA = (match.teamA?.name ?? "").trim() || "tbd";
  const teamB = (match.teamB?.name ?? "").trim() || "tbd";
  const slug = `${teamA}-vs-${teamB}`.toLowerCase().replace(/\s+/g, "-");

  const params = new URLSearchParams({
    fixture: slug,
    date: fmt.dateInputValue,
    time: fmt.time,
    flagA: match.teamA?.flag || "",
    flagB: match.teamB?.flag || "",
    ...extras,
  });

  return `${baseUrl}?${params.toString()}`;
}

/** book.html URL with full fixture carry. Pass `{ zone }` to skip zones.html. */
export function buildBookingURL(match, extras) {
  return buildMatchURL("book.html", match, extras);
}

/** zones.html URL carrying the fixture forward for zone comparison. */
export function buildZonesURL(match) {
  return buildMatchURL("zones.html", match);
}

/**
 * CSS background-image value built from `raw`, or "" if missing, malformed,
 * or non-http(s). Guards against CSS injection on API-supplied URLs.
 */
export function safeBackgroundUrl(raw) {
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.href);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return `url("${encodeURI(u.href).replace(/"/g, "%22")}")`;
  } catch {
    return "";
  }
}
