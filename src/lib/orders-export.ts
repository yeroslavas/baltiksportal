// Builds the production order export and pushes it to Google Sheets. One row per
// order LINE ITEM (so pivots can sum by product/date), with raw order/customer/
// product fields plus a computed bake-units column (quantity × report_count).
// The kitchen slices the rest with Sheets pivot tables on separate tabs.
//
// Server-only. The sheet is a derived mirror of Supabase (the source of truth):
// each run full-replaces it, so a failed/partial run is fully corrected next run.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  pushToSheet,
  sheetsConfigured,
  sheetsTabName,
  type Cell,
} from "@/lib/google-sheets";

const HEADERS: string[] = [
  "Order #",
  "Status",
  "Order date",
  "Fulfillment",
  "Fulfillment date",
  "Window",
  "Customer",
  "Contact",
  "Product",
  "SKU",
  "Report group",
  "Report unit",
  "Bake time",
  "Product type",
  "Quantity",
  "Units per",
  "Bake units",
  "Bake trays",
  "Unit price",
  "Line total",
  "Order total", // order-level; written once per order (first row) so it sums cleanly
  "From standing order",
  "Order ID",
];

const ORDER_TOTAL_COL = HEADERS.indexOf("Order total");
const ORDER_ID_COL = HEADERS.indexOf("Order ID");

type ItemRow = {
  product_name: string;
  quantity: number | string;
  unit_price: number | string;
  line_total: number | string;
  order_id: string;
  orders: {
    order_number: number;
    status: string;
    order_date: string;
    fulfillment_type: string;
    delivery_date: string | null;
    delivery_time: string | null;
    total_amount: number | string;
    standing_order_id: string | null;
    customers: { business_name: string; contact_name: string | null } | null;
  } | null;
  products: {
    sku: string | null;
    report_group: string | null;
    report_unit: string | null;
    report_count: number | null;
    bake_time: string | null;
    product_type: string | null;
  } | null;
};

const SELECT =
  "product_name, quantity, unit_price, line_total, order_id, " +
  "orders!inner(order_number, status, order_date, fulfillment_type, delivery_date, delivery_time, total_amount, standing_order_id, customers(business_name, contact_name)), " +
  "products(sku, report_group, report_unit, report_count, bake_time, product_type)";

const round2 = (n: number) => Math.round(n * 100) / 100;

// Bagels per bake tray — bake_trays = bake_units / TRAY_SIZE.
const TRAY_SIZE = 15;

async function buildOrderRows(): Promise<{ header: string[]; rows: Cell[][] }> {
  const admin = createAdminClient();

  // Paginate so the PostgREST 1000-row cap can never silently truncate the feed
  // (a short sheet would mean under-baking — the worst failure mode here).
  const PAGE = 1000;
  const items: ItemRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("order_items")
      .select(SELECT)
      .order("order_id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Order export query failed: ${error.message}`);
    const batch = (data ?? []) as unknown as ItemRow[];
    items.push(...batch);
    if (batch.length < PAGE) break;
  }

  const rows: Cell[][] = [];
  for (const it of items) {
    const o = it.orders;
    if (!o || o.status === "canceled") continue; // canceled orders aren't produced
    const p = it.products;
    const qty = Number(it.quantity);
    const reportCount = p?.report_count != null ? Number(p.report_count) : null;
    const bakeUnits = reportCount != null ? round2(qty * reportCount) : "";
    // Fractional trays (kept un-rounded-up so pivot sums stay accurate; round up
    // at the aggregate, not per row).
    const bakeTrays = reportCount != null ? round2((qty * reportCount) / TRAY_SIZE) : "";
    rows.push([
      o.order_number,
      o.status,
      o.order_date.slice(0, 10),
      o.fulfillment_type,
      o.delivery_date ?? "",
      o.delivery_time ?? "",
      o.customers?.business_name ?? "",
      o.customers?.contact_name ?? "",
      it.product_name,
      p?.sku ?? "",
      p?.report_group ?? "",
      p?.report_unit ?? "",
      p?.bake_time ?? "",
      p?.product_type ?? "",
      qty,
      reportCount ?? "",
      bakeUnits,
      bakeTrays,
      round2(Number(it.unit_price)),
      round2(Number(it.line_total)),
      round2(Number(o.total_amount)), // blanked below for all but each order's first row
      o.standing_order_id ? "yes" : "no",
      it.order_id,
    ]);
  }

  // Production-friendly order: by fulfillment date, then order number. Rows with
  // no fulfillment date sort last.
  rows.sort((a, b) => {
    const da = String(a[4]);
    const db = String(b[4]);
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return da < db ? -1 : 1;
    }
    return Number(a[0]) - Number(b[0]);
  });

  // Keep the order total on only the FIRST row of each order (now that rows are
  // sorted, same-order lines are contiguous) so summing the column = gross
  // order volume, with no per-line-item double-counting.
  const seenOrders = new Set<string>();
  for (const row of rows) {
    const oid = String(row[ORDER_ID_COL]);
    if (seenOrders.has(oid)) row[ORDER_TOTAL_COL] = "";
    else seenOrders.add(oid);
  }

  return { header: HEADERS, rows };
}

export type SyncState = {
  at: string; // ISO timestamp of the attempt
  ok: boolean;
  rows: number;
  error: string | null;
  durationMs: number;
};

async function saveSyncState(state: SyncState): Promise<void> {
  const admin = createAdminClient();
  await admin.from("app_settings").update({ sheets_sync_state: state }).eq("id", 1);
}

export async function getSyncState(): Promise<SyncState | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("app_settings")
    .select("sheets_sync_state")
    .eq("id", 1)
    .maybeSingle<{ sheets_sync_state: SyncState | null }>();
  return data?.sheets_sync_state ?? null;
}

// Stale if the last successful sync is older than this (cron runs hourly).
const STALE_MS = 90 * 60 * 1000;

function relativeAge(ms: number): string {
  if (ms < 60000) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export type SyncStatus = {
  state: SyncState | null;
  stale: boolean;
  ageLabel: string | null;
};

// State + derived freshness for the admin UI. Time math lives here (a server
// module) rather than in the page component, which must stay render-pure.
export async function getSyncStatus(): Promise<SyncStatus> {
  const state = await getSyncState();
  if (!state) return { state: null, stale: false, ageLabel: null };
  const ms = Math.max(0, Date.now() - new Date(state.at).getTime());
  return { state, stale: state.ok && ms > STALE_MS, ageLabel: relativeAge(ms) };
}

// Run the full export. Always records a sync state (so the admin UI and the
// in-sheet stamp reflect success OR failure). Never throws — returns the state.
export async function exportOrdersToSheet(): Promise<SyncState> {
  const startMs = Date.now();
  const at = new Date().toISOString();

  if (!sheetsConfigured()) {
    const state: SyncState = {
      at,
      ok: false,
      rows: 0,
      error: "Google Sheets is not configured yet.",
      durationMs: 0,
    };
    await saveSyncState(state).catch(() => {});
    return state;
  }

  try {
    const { header, rows } = await buildOrderRows();
    // Push the full grid to the sheet's Apps Script. The script full-replaces
    // the data tab and stamps the "Sync status" tab. Throws → run is a failure.
    const result = await pushToSheet({
      tab: sheetsTabName(),
      values: [header, ...rows],
      syncedAt: at,
    });

    const state: SyncState = {
      at,
      ok: true,
      rows: result.rows,
      error: null,
      durationMs: Date.now() - startMs,
    };
    await saveSyncState(state);
    return state;
  } catch (err) {
    const state: SyncState = {
      at,
      ok: false,
      rows: 0,
      error: err instanceof Error ? err.message : "Unknown error.",
      durationMs: Date.now() - startMs,
    };
    await saveSyncState(state).catch(() => {});
    return state;
  }
}
