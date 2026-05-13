/**
 * Builds a parametric URL for the booking concierge.
 * @param {object} match - The match data object
 */
export function buildBookingURL(match) {
  const baseUrl = "./book.html";
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
