/**
 * `Intl.RelativeTimeFormat`-backed replacement for date-fns'
 * `formatDistanceToNow`. Same call sites; saves ~14 kB gzip.
 *
 * Differences from date-fns to be aware of:
 * - No "about" / "less than" qualifiers — output is "2 hours ago",
 *   not "about 2 hours ago".
 * - With `numeric: 'auto'`, the platform substitutes "yesterday" /
 *   "tomorrow" for ±1 day, etc. Cleaner than always-numeric.
 */
const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
];

export function formatDistanceToNow(
  date: Date,
  opts?: { addSuffix?: boolean },
): string {
  const diffSec = Math.round((date.getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  const [unit, sec] = UNITS.find(([, s]) => absSec >= s) ?? UNITS[UNITS.length - 1];
  const value = Math.round(diffSec / sec);
  const formatted = rtf.format(value, unit);
  if (opts?.addSuffix) return formatted;
  // Without addSuffix, callers want just the magnitude — strip
  // direction tokens ("in 2 hours", "2 hours ago", "yesterday").
  // For the special-case strings (yesterday/today/tomorrow), the
  // best stripped form is the unit itself.
  if (/^(yesterday|today|tomorrow|now|last|next)/i.test(formatted)) {
    return `${Math.abs(value)} ${unit}${Math.abs(value) === 1 ? '' : 's'}`;
  }
  return formatted.replace(/^in\s+/i, '').replace(/\s+ago$/i, '');
}
