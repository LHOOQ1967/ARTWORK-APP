// Cities where auction sales commonly take place, mapped to IANA timezones.
// Keep in sync with the city list used by the auction import pipeline
// (lib/imports/auction.ts).
const AUCTION_CITY_TIMEZONES: Record<string, string> = {
  'new york': 'America/New_York',
  london: 'Europe/London',
  paris: 'Europe/Paris',
  'hong kong': 'Asia/Hong_Kong',
  geneva: 'Europe/Zurich',
  zurich: 'Europe/Zurich',
  milan: 'Europe/Rome',
  rome: 'Europe/Rome',
  monaco: 'Europe/Monaco',
  amsterdam: 'Europe/Amsterdam',
  cologne: 'Europe/Berlin',
  dubai: 'Asia/Dubai',
  shanghai: 'Asia/Shanghai',
  beijing: 'Asia/Shanghai',
  singapore: 'Asia/Singapore',
  tokyo: 'Asia/Tokyo',
  sydney: 'Australia/Sydney',
  'los angeles': 'America/Los_Angeles',
  'san francisco': 'America/Los_Angeles',
};

/** City names offered in the sale location dropdowns, alphabetically sorted. */
export const AUCTION_CITY_OPTIONS = Object.keys(AUCTION_CITY_TIMEZONES)
  .map((city) => city.replace(/(^|\s)\w/g, (letter) => letter.toUpperCase()))
  .sort((a, b) => a.localeCompare(b, 'en'));

/** Resolves a sale city to its IANA timezone, or null when unknown. */
export function resolveAuctionCityTimeZone(city?: string | null): string | null {
  const normalized = city?.trim().toLowerCase() ?? '';
  if (!normalized) return null;
  return (
    Object.entries(AUCTION_CITY_TIMEZONES).find(
      ([name]) => normalized === name || normalized.startsWith(`${name},`)
    )?.[1] ?? null
  );
}

function wallClockAsUtc(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value);
  return Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute')
  );
}

/** Converts a naive wall-clock time in the given timezone to a UTC instant. */
function naiveZonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const desired = Date.UTC(year, month - 1, day, hour, minute);
  let utc = desired;
  // Iterate to converge on the UTC instant whose wall clock matches (handles DST).
  for (let i = 0; i < 3; i += 1) {
    const diff = desired - wallClockAsUtc(new Date(utc), timeZone);
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export type OutlookEventInput = {
  /** Meeting subject, e.g. the auction label. */
  title: string;
  /** Auction house, used in the subject and meeting location. */
  auctionHouse?: string | null;
  /** City where the sale takes place; determines the sale timezone. */
  city?: string | null;
  /** Naive datetime string in the sale city's local time, e.g. "2026-03-12T14:00:00". */
  auctionDateTime?: string | null;
  /** Link to the sale (web link or document). */
  url?: string | null;
  /** Free-form notes appended to the meeting body. */
  notes?: string | null;
  /** Meeting duration in minutes. Defaults to 60. */
  durationMinutes?: number;
};

/**
 * Builds an Outlook on the web "compose event" deeplink prefilled with the
 * auction details. The auction datetime is interpreted in the sale city's
 * timezone and sent to Outlook as UTC, so each attendee sees the meeting in
 * their own timezone (e.g. a 13:00 London sale shows as 14:00 in Geneva).
 * Returns null when the sale city timezone cannot be resolved, to avoid
 * creating a meeting at a wrong time.
 */
export function buildOutlookEventUrl(input: OutlookEventInput): string | null {
  const timeZone = resolveAuctionCityTimeZone(input.city);
  if (!timeZone) return null;

  const match = String(input.auctionDateTime ?? '').match(
    /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute] = match.map(Number);
  const start = naiveZonedTimeToUtc(year, month, day, hour, minute, timeZone);
  if (Number.isNaN(start.getTime())) return null;

  const durationMinutes = input.durationMinutes ?? 60;
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

  const location = [input.auctionHouse?.trim(), input.city?.trim()]
    .filter(Boolean)
    .join(', ');

  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: input.auctionHouse
      ? `${input.title} – ${input.auctionHouse}`
      : input.title,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
  });

  if (location) params.set('location', location);

  const bodyParts: string[] = [];
  if (input.url) bodyParts.push(input.url);
  if (input.notes) bodyParts.push(input.notes);
  if (bodyParts.length > 0) params.set('body', bodyParts.join('\n\n'));

  return `https://outlook.office.com/calendar/deeplink/compose?${params.toString()}`;
}
