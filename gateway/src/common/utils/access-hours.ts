export interface AccessHours {
  start: string; // HH:MM
  end: string; // HH:MM
  tz: string;
}

function toSeconds(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((n) => Number.parseInt(n, 10));
  return h * 3600 + m * 60;
}

export function localSecondsOfDay(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(date);
  const get = (t: string) => Number.parseInt(parts.find((p) => p.type === t)?.value ?? '0', 10);
  let hour = get('hour');
  if (hour === 24) hour = 0;
  return hour * 3600 + get('minute') * 60 + get('second');
}

/** Interval [start, end) evaluated in the given timezone. */
export function isWithinAccessHours(now: Date, hours: AccessHours): boolean {
  const start = toSeconds(hours.start);
  const end = toSeconds(hours.end);
  const cur = localSecondsOfDay(now, hours.tz);
  if (start <= end) {
    return cur >= start && cur < end;
  }
  return cur >= start || cur < end; // wraps past midnight
}
