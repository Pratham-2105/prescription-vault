/**
 * Helpers for the API's `Format: date` fields (visit_date, start_date,
 * date_of_birth), which are calendar dates — "YYYY-MM-DD" — not instants.
 *
 * These deliberately use the LOCAL calendar, never UTC. Date#toISOString()
 * converts to UTC first, so at 00:30 IST it reports yesterday's date. A visit
 * on the 7th must be stored as the 7th regardless of the user's offset.
 */

/** Matches a calendar date and captures its parts. */
const API_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Formats a Date as the API's calendar-date string, in the local timezone. */
export function toApiDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Today's calendar date, in the local timezone. */
export function todayApiDate(): string {
  return toApiDate(new Date());
}

/**
 * Parses a calendar-date string into a local-midnight Date, or null if the
 * string is malformed or names a day that does not exist.
 *
 * Use this to seed a date picker from a stored value. Do NOT use
 * `new Date('2026-09-07')` for this: the single-argument string form is
 * parsed as UTC midnight, which renders as the previous day in any timezone
 * behind UTC.
 */
export function parseApiDate(value: string): Date | null {
  const match = API_DATE_PATTERN.exec(value);
  if (!match) return null;

  // Indexing a match array is an indexed access, so under
  // noUncheckedIndexedAccess each part is `string | undefined` even though
  // the pattern guarantees three groups. The compiler is right to insist:
  // exec() results are not typed by the pattern's shape.
  const [, year, month, day] = match;
  if (year === undefined || month === undefined || day === undefined) return null;

  // The three-argument Date constructor builds a LOCAL date.
  const parsed = new Date(Number(year), Number(month) - 1, Number(day));

  // JS rolls invalid days over silently: month 1, day 31 becomes March 3rd.
  // Round-tripping is the cheapest way to reject those.
  return toApiDate(parsed) === value ? parsed : null;
}

/** True if the string is a calendar date naming a day that exists. */
export function isApiDate(value: string): boolean {
  return parseApiDate(value) !== null;
}

/** True if the calendar date is later than today, local time. */
export function isFutureApiDate(value: string): boolean {
  return value > todayApiDate();
}