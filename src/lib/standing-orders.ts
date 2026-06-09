// Pure scheduling math for standing orders — no I/O, so it's shared by the
// admin list ("next date") and the generator (which dates are due). All dates
// are calendar strings ("YYYY-MM-DD"); a date's weekday is timezone-independent,
// and "today" is resolved in the business timezone via businessToday().

export const BUSINESS_TZ = "America/New_York";

const DOW_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export type StandingOrderSchedule = {
  is_active: boolean;
  days_of_week: number[]; // ISO: 1 = Mon … 7 = Sun
  interval_weeks: number; // 1 weekly, 2 every other week
  anchor_date: string; // first eligible date + biweekly parity anchor
  end_date: string | null;
  skip_dates: string[];
  lead_days: number;
};

// "YYYY-MM-DD" for today in the business timezone (en-CA formats as ISO).
export function businessToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const toMs = (d: string): number => {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fromMs = (ms: number): string => {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
export const addDays = (d: string, n: number): string =>
  fromMs(toMs(d) + n * 86_400_000);
const daysBetween = (a: string, b: string): number =>
  Math.round((toMs(b) - toMs(a)) / 86_400_000);

// ISO weekday 1..7 (Mon..Sun) of a calendar date.
export function isoWeekday(d: string): number {
  const wd = new Date(toMs(d)).getUTCDay(); // 0 Sun .. 6 Sat
  return wd === 0 ? 7 : wd;
}
// Monday of the date's week (for biweekly parity).
const weekStart = (d: string): string => addDays(d, -(isoWeekday(d) - 1));

// Does this template produce an order on calendar date D?
export function occursOn(t: StandingOrderSchedule, d: string): boolean {
  if (!t.is_active) return false;
  if (d < t.anchor_date) return false;
  if (t.end_date && d > t.end_date) return false;
  if (!t.days_of_week.includes(isoWeekday(d))) return false;
  if (t.interval_weeks === 2) {
    const weeks = daysBetween(weekStart(t.anchor_date), weekStart(d)) / 7;
    if (Math.round(weeks) % 2 !== 0) return false;
  }
  if (t.skip_dates.includes(d)) return false;
  return true;
}

// The next date on/after `from` that this template fires (null within horizon).
export function nextOccurrence(
  t: StandingOrderSchedule,
  from: string,
  horizonDays = 180,
): string | null {
  const start = from < t.anchor_date ? t.anchor_date : from;
  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(start, i);
    if (t.end_date && d > t.end_date) return null;
    if (occursOn(t, d)) return d;
  }
  return null;
}

// Delivery dates that should be generated as of `today`: any firing date within
// the lead window [today, today + lead_days] (self-healing — a missed day is
// still caught next run as long as the date hasn't passed).
export function dueDates(t: StandingOrderSchedule, today: string): string[] {
  const out: string[] = [];
  for (let i = 0; i <= t.lead_days; i++) {
    const d = addDays(today, i);
    if (occursOn(t, d)) out.push(d);
  }
  return out;
}

export function formatSchedule(t: {
  days_of_week: number[];
  interval_weeks: number;
}): string {
  const days =
    [...t.days_of_week]
      .sort((a, b) => a - b)
      .map((d) => DOW_SHORT[d - 1])
      .filter(Boolean)
      .join(", ") || "—";
  return `${days} · ${t.interval_weeks === 2 ? "every other week" : "weekly"}`;
}
