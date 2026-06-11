// Pure logic for the next-day ordering cutoff. No I/O and no server-only deps,
// so it's safe on either side. "Now" and the cutoff hour are resolved in the
// business timezone (America/New_York) — the same anchor the rest of the app
// uses (see src/lib/standing-orders.ts).

import {
  BUSINESS_TZ,
  businessToday,
  addDays,
  isoWeekday,
} from "@/lib/standing-orders";

// Current hour (0–23) in the business timezone.
export function businessHour(now: Date = new Date()): number {
  const hh = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // "24" can appear for midnight in some environments — normalize to 0.
  const n = parseInt(hh, 10);
  return n === 24 ? 0 : n;
}

// The earliest fulfillment date ("YYYY-MM-DD") a customer may choose: tomorrow
// normally, or the day after once the cutoff hour has passed today (the night
// before closes at the cutoff). Never same-day.
export function earliestFulfillmentDate(
  now: Date,
  cutoffHour: number,
): string {
  const today = businessToday(now);
  const pastCutoff = businessHour(now) >= cutoffHour;
  return addDays(today, pastCutoff ? 2 : 1);
}

// Advance `from` (inclusive) to the next date whose weekday is an available
// (open) day. Falls back to `from` if no day is available within two weeks.
export function nextAvailableDate(from: string, availableDays: number[]): string {
  if (availableDays.length === 0) return from;
  let d = from;
  for (let i = 0; i < 14; i++) {
    if (availableDays.includes(isoWeekday(d))) return d;
    d = addDays(d, 1);
  }
  return from;
}

// "20" -> "8:00 PM" for display in the checkout note and Utilities form.
export function formatCutoffHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}:00 ${period}`;
}
