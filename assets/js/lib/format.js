/* =========================================================================
   FORMAT HELPERS
   Countdown primitives consumed by the marquee. All other date/time
   formatting lives in matchData.js (Europe/London timezone-locked) so
   there is exactly one authority for fixture timestamps site-wide.
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
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    mins: Math.floor((totalSeconds % 3600) / 60),
    hasPassed: false,
  };
}

/**
 * Scoreboard countdown format. Granularity collapses as the value grows
 * so the marquee text stays stable at any horizon:
 *   t ≥ 24h   →  "31D 4H"      (no minutes — would re-render every minute
 *                                for no perceivable benefit at this scale)
 *   1h ≤ t   →  "4H 12M"       (hours + minutes inside a day)
 *   t < 1h   →  "45M"          (minutes only as kickoff approaches)
 * Seconds are never shown — the marquee re-renders only on minute
 * boundaries (see marquee.js's setTimeout chain).
 */
export function formatCountdown(c) {
  if (c.hasPassed) return "KICK-OFF";

  if (c.days > 0) {
    return `${c.days}D ${c.hours}H`;
  }
  if (c.hours > 0) {
    return `${c.hours}H ${c.mins}M`;
  }
  return `${c.mins}M`;
}
