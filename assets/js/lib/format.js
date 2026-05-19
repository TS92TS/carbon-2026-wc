/* =========================================================================
   FORMAT HELPERS · countdown primitives for the marquee. Date/time display
   formatting lives in matchData.js (Europe/London timezone-locked).
   ========================================================================= */

export function countdownTo(target) {
  if (!target) return { hasPassed: true };

  const t = target instanceof Date ? target : new Date(target);
  if (isNaN(t)) return { hasPassed: true };

  const totalMs = t.getTime() - Date.now();
  if (totalMs <= 0) return { days: 0, hours: 0, mins: 0, hasPassed: true };

  const totalSeconds = Math.floor(totalMs / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    mins: Math.floor((totalSeconds % 3600) / 60),
    hasPassed: false,
  };
}

/**
 * Granularity collapses as the value grows so the marquee text stays
 * stable at any horizon:
 *   t ≥ 24h  →  "31D 4H"
 *   t ≥ 1h   →  "4H 12M"
 *   t < 1h   →  "45M"
 */
export function formatCountdown(c) {
  if (c.hasPassed) return "KICK-OFF";
  if (c.days > 0) return `${c.days}D ${c.hours}H`;
  if (c.hours > 0) return `${c.hours}H ${c.mins}M`;
  return `${c.mins}M`;
}
