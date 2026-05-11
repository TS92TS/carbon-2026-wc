
/* =========================================================================
   FORMAT HELPERS
   Pure functions. No DOM. No side effects.
   ========================================================================= */
 
/**
 * Returns the difference between now and a target ISO date as an object.
 * @param {string|Date} target — ISO date string or Date instance
 * @returns {{days: number, hours: number, minutes: number, seconds: number, totalMs: number, hasPassed: boolean}}
 */
export function countdownTo(target) {
  const t = target instanceof Date ? target : new Date(target);
  const totalMs = t.getTime() - Date.now();
 
  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, hasPassed: true };
  }
 
  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days:    Math.floor(totalSeconds / 86400),
    hours:   Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalMs,
    hasPassed: false
  };
}
 
/**
 * Formats a countdown object as a compact scoreboard-style string.
 * Always short enough to fit a mobile marquee.
 *
 * Examples:
 *   { days: 31, hours: 4, minutes: 12, seconds: 9 }   →  "31D 04:12:09"
 *   { days: 0,  hours: 4, minutes: 12, seconds: 9 }   →  "04:12:09"
 *   { days: 0,  hours: 0, minutes: 12, seconds: 9 }   →  "12:09"
 *   passed                                            →  "KICK-OFF"
 *
 * @param {object} c — output of countdownTo()
 * @returns {string}
 */
export function formatCountdown(c) {
  if (c.hasPassed) return 'KICK-OFF';
 
  const pad = (n) => String(n).padStart(2, '0');
 
  if (c.days >= 1) {
    return `${c.days}D ${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
  }
  if (c.hours >= 1) {
    return `${pad(c.hours)}:${pad(c.minutes)}:${pad(c.seconds)}`;
  }
  return `${pad(c.minutes)}:${pad(c.seconds)}`;
}
 
/**
 * Formats a UK-localised date string from an ISO string.
 * Example: "Sat 20 Jun · 20:00"
 */
export function formatMatchDate(iso) {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} ${date} · ${time}`;
}
 
/**
 * Formats a GBP currency value.
 */
export function formatGBP(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);
}
 