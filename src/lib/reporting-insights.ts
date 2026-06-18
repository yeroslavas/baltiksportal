// In-app sales insights for the admin Reporting page. Aggregates orders +
// line items over a delivery-date range. Server-only. Same data source as the
// Sheets export, computed in-app (no external dependency, no new tables).
//
// Decisions (locked with Yero): filter by DELIVERY date; "$ volume" = order
// total incl. delivery fees; "bagels" = products whose report_group looks like
// a bagel group (report_group matches /bagel/i), counted as quantity ×
// report_count. If your bagel products use a different report_group value,
// adjust BAGEL_GROUP below.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const BAGEL_GROUP = /bagel/i;

type ItemRow = {
  quantity: number | string;
  order_id: string;
  orders: {
    status: string;
    delivery_date: string | null;
    total_amount: number | string;
    customers: { business_name: string } | null;
  } | null;
  products: { report_group: string | null; report_count: number | null } | null;
};

const SELECT =
  "quantity, order_id, " +
  "orders!inner(status, delivery_date, total_amount, customers(business_name)), " +
  "products(report_group, report_count)";

// Mon-first so the weekday chart reads like a work week.
const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const round2 = (n: number) => Math.round(n * 100) / 100;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const isDate = (s?: string): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// ISO weekday 1=Mon … 7=Sun from a YYYY-MM-DD string (UTC-parsed to avoid drift).
function isoWeekday(dateStr: string): number {
  const day = new Date(`${dateStr}T00:00:00Z`).getUTCDay(); // 0=Sun … 6=Sat
  return day === 0 ? 7 : day;
}

export type Insights = {
  from: string;
  to: string;
  bagelsTotal: number;
  revenueTotal: number;
  orderCount: number;
  topCustomers: { name: string; total: number }[];
  weekday: { label: string; avg: number }[]; // Mon … Sun
};

export async function getInsights(opts: {
  from?: string;
  to?: string;
}): Promise<Insights> {
  // Resolve the range: default to the last 30 days (inclusive) ending today.
  const today = new Date();
  const to = isDate(opts.to) ? opts.to : isoDate(today);
  const from = isDate(opts.from)
    ? opts.from
    : isoDate(new Date(today.getTime() - 29 * 86_400_000));

  // Fetch all line items (paginated so the 1000-row cap can't truncate), then
  // filter to the range in JS. Matches the export's proven query shape.
  const admin = createAdminClient();
  const PAGE = 1000;
  const rows: ItemRow[] = [];
  for (let i = 0; ; i += PAGE) {
    const { data, error } = await admin
      .from("order_items")
      .select(SELECT)
      .order("order_id", { ascending: true })
      .range(i, i + PAGE - 1);
    if (error) throw new Error(`Insights query failed: ${error.message}`);
    const batch = (data ?? []) as unknown as ItemRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  // Order-level facts deduped by order id (so revenue isn't multiplied by lines).
  const orders = new Map<string, { total: number; customer: string }>();
  let bagelsTotal = 0;
  const weekdayUnits = new Array(8).fill(0); // index by ISO weekday 1..7
  const weekdayDays: Array<Set<string>> = Array.from({ length: 8 }, () => new Set());

  for (const r of rows) {
    const o = r.orders;
    if (!o || o.status === "canceled") continue;
    const dd = o.delivery_date;
    if (!dd || dd < from || dd > to) continue;

    if (!orders.has(r.order_id)) {
      orders.set(r.order_id, {
        total: Number(o.total_amount) || 0,
        customer: o.customers?.business_name ?? "—",
      });
    }

    const p = r.products;
    if (p?.report_group && BAGEL_GROUP.test(p.report_group) && p.report_count != null) {
      const units = (Number(r.quantity) || 0) * Number(p.report_count);
      bagelsTotal += units;
      const wd = isoWeekday(dd);
      weekdayUnits[wd] += units;
      weekdayDays[wd].add(dd);
    }
  }

  let revenueTotal = 0;
  const byCustomer = new Map<string, number>();
  for (const { total, customer } of orders.values()) {
    revenueTotal += total;
    byCustomer.set(customer, (byCustomer.get(customer) ?? 0) + total);
  }
  const topCustomers = [...byCustomer.entries()]
    .map(([name, total]) => ({ name, total: round2(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const weekday = WEEKDAY_LABELS.map((label, idx) => {
    const wd = idx + 1;
    const days = weekdayDays[wd].size;
    return { label, avg: days > 0 ? Math.round(weekdayUnits[wd] / days) : 0 };
  });

  return {
    from,
    to,
    bagelsTotal: Math.round(bagelsTotal),
    revenueTotal: round2(revenueTotal),
    orderCount: orders.size,
    topCustomers,
    weekday,
  };
}
