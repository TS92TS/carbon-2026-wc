import { formatMatchDateTime } from "./matchData.js";

/**
 * Internal: builds a `<base>?fixture=...&date=...&time=...&flagA=...&flagB=...`
 * URL anchored at the given page. Shared by buildBookingURL + buildZonesURL.
 * The `date` and `time` params are emitted in Europe/London — they populate
 * the booking form's <input type="date"> / <input type="time"> directly, so
 * they must match what the user saw in the originating feed.
 * @param {string} baseUrl - target page (e.g. "book.html", "zones.html")
 * @param {object} match - match data object (datetimeIso, teamA, teamB)
 * @param {object} [extras] - additional params to fold in (e.g. {zone}).
 *   Spread AFTER the base params so callers can override but in practice
 *   the use case is additive: Path B's fixturesPage skips zones.html by
 *   building a book.html URL that carries the user's already-picked zone.
 * @returns {string}
 */
function buildMatchURL(baseUrl, match, extras = {}) {
  if (!match || !match.datetimeIso) return baseUrl;

  const fmt = formatMatchDateTime(match.datetimeIso);
  if (!fmt) return baseUrl;

  const teamA = match.teamA?.name || "tbd";
  const teamB = match.teamB?.name || "tbd";
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

/**
 * Builds a parametric URL for the booking concierge. Use this for CTAs that
 * jump straight to the booking form once both fixture AND zone are known
 * (Path B's skip-the-middle case). Pass `{ zone: "<slug>" }` in extras.
 * @param {object} match
 * @param {object} [extras]
 * @returns {string}
 */
export function buildBookingURL(match, extras) {
  return buildMatchURL("book.html", match, extras);
}

/**
 * Builds a parametric URL for the zones page, carrying the fixture forward
 * so the user can compare zones with full match context. Use this for any
 * CTA originating from a fixture row or featured-match card.
 * @param {object} match
 * @returns {string}
 */
export function buildZonesURL(match) {
  return buildMatchURL("zones.html", match);
}

/**
 * Returns a CSS background-image value built from a URL, or "" if the URL is
 * missing, malformed, or uses a non-http(s) scheme. Guards against CSS
 * injection when applying user- or API-supplied URLs to style.backgroundImage.
 * @param {string} raw
 * @returns {string}
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
