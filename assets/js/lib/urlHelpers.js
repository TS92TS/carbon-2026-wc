/**
 * Internal: builds a `<base>?fixture=...&date=...&time=...&flagA=...&flagB=...`
 * URL anchored at the given page. Shared by buildBookingURL + buildZonesURL.
 * @param {string} baseUrl - target page (e.g. "book.html", "zones.html")
 * @param {object} match - match data object (datetimeIso, teamA, teamB)
 * @returns {string}
 */
function buildMatchURL(baseUrl, match) {
  if (!match || !match.datetimeIso) return baseUrl;

  const dateObj = new Date(match.datetimeIso);
  if (isNaN(dateObj.getTime())) return baseUrl;

  const teamA = match.teamA?.name || "tbd";
  const teamB = match.teamB?.name || "tbd";
  const slug = `${teamA}-vs-${teamB}`.toLowerCase().replace(/\s+/g, "-");

  const date = dateObj.toISOString().split("T")[0];
  const time = dateObj.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const params = new URLSearchParams({
    fixture: slug,
    date: date,
    time: time,
    flagA: match.teamA?.flag || "",
    flagB: match.teamB?.flag || "",
  });

  return `${baseUrl}?${params.toString()}`;
}

/**
 * Builds a parametric URL for the booking concierge. Use this for CTAs that
 * jump straight to the booking form (zone cards, hero "Book Now", etc.).
 * @param {object} match
 * @returns {string}
 */
export function buildBookingURL(match) {
  return buildMatchURL("book.html", match);
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
