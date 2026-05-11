/* =========================================================================
   FORMAT HELPERS
   Refined for naming consistency and marquee stability.
   ========================================================================= */

/**
 * Returns the difference between now and a target ISO date.
 * Uses 'mins' to match the marquee component requirements.
 */
export function countdownTo(target) {
  if (!target) return { hasPassed: true };
  
  const t = target instanceof Date ? target : new Date(target);
  if (isNaN(t)) return { hasPassed: true };

  const totalMs = t.getTime() - Date.now();

  if (totalMs <= 0) {
    return { days: 0, hours: 0, mins: 0, hasPassed: true };
  }

  const totalSeconds = Math.floor(totalMs / 1000);
  
  return {
    days:  Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    mins:  Math.floor((totalSeconds % 3600) / 60),
    hasPassed: false
  };
}

/**
 * Scoreboard style: "31D 4H 12M"
 * Removes seconds to prevent marquee jitter on mobile.
 */
export function formatCountdown(c) {
  if (c.hasPassed) return 'KICK-OFF';

  const parts = [];
  if (c.days > 0) parts.push(`${c.days}D`);
  if (c.hours > 0 || c.days > 0) parts.push(`${c.hours}H`);
  parts.push(`${c.mins}M`);

  return parts.join(' ');
}

/**
 * UK Date formatting for Match Rows
 */
export function formatMatchDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "TBC";
  
  const day = d.toLocaleDateString('en-GB', { weekday: 'short' });
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  
  return `${day} ${date} · ${time}`;
}

export function formatGBP(amount) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2
  }).format(amount);
}