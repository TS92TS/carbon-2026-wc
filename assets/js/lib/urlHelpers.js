/**
 * Builds a parametric URL for the booking concierge.
 * @param {object} match - The match data object
 */
export function buildBookingURL(match) {
  const baseUrl = "book.html";
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
