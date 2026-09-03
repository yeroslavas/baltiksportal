// The standing-order generator. Run nightly from the secured cron route. Pure
// scheduling math lives in standing-orders.ts; order creation reuses the shared
// server-authoritative core. Server-only (service_role) — never import client-side.

import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer } from "@/lib/orders";
import { businessToday, dueDates } from "@/lib/standing-orders";
import type { StandingOrder, StandingOrderItem } from "@/lib/types";

export type GenerationSummary = {
  today: string;
  created: { standingOrderId: string; date: string; orderNumber: number }[];
  alreadyPresent: number; // due, but an order already existed (idempotent no-op)
  canceled: { orderId: string; date: string }[]; // pending orders removed (skipped/paused)
  skippedEmpty: string[]; // standing orders with no items
  skippedLocked: string[]; // standing orders skipped — customer has overdue invoices
  errors: { standingOrderId: string; date: string; error: string }[];
};

export async function generateStandingOrders(
  now: Date = new Date(),
): Promise<GenerationSummary> {
  const admin = createAdminClient();
  const today = businessToday(now);
  const summary: GenerationSummary = {
    today,
    created: [],
    alreadyPresent: 0,
    canceled: [],
    skippedEmpty: [],
    skippedLocked: [],
    errors: [],
  };

  // --- Generate: materialize due orders for active standing orders. ----------
  const { data: activeData } = await admin
    .from("standing_orders")
    .select("*")
    .eq("is_active", true);
  const active = (activeData ?? []) as StandingOrder[];

  if (active.length > 0) {
    // Customers with overdue invoices are locked out of new orders — including
    // auto-generated standing orders — until they pay. Must match the canonical
    // check in getOverdueInvoices(): ANY 'overdue' invoice (e.g. a manual early
    // credit hold with a future due date) OR an unpaid invoice now past due.
    const { data: overdueRows } = await admin
      .from("invoices")
      .select("customer_id")
      .or(`status.eq.overdue,and(status.eq.unpaid,due_date.lt.${today})`)
      // In-flight payment (ACH authorized) lifts the stop on authorization too.
      .is("stripe_payment_id", null);
    const lockedCustomers = new Set(
      (overdueRows ?? []).map((r) => r.customer_id),
    );

    // Time-boxed admin override: customers explicitly allowed to keep ordering
    // despite overdue invoices (credit_hold_override_until >= today) are NOT
    // locked. Mirrors creditOverrideActive() / the checkout gate.
    if (lockedCustomers.size > 0) {
      const { data: overridden } = await admin
        .from("customers")
        .select("id")
        .gte("credit_hold_override_until", today);
      for (const r of overridden ?? []) lockedCustomers.delete(r.id);
    }

    const { data: itemData } = await admin
      .from("standing_order_items")
      .select("*")
      .in(
        "standing_order_id",
        active.map((s) => s.id),
      );
    const itemsBySo = new Map<string, StandingOrderItem[]>();
    for (const it of (itemData ?? []) as StandingOrderItem[]) {
      const arr = itemsBySo.get(it.standing_order_id) ?? [];
      arr.push(it);
      itemsBySo.set(it.standing_order_id, arr);
    }

    for (const so of active) {
      if (lockedCustomers.has(so.customer_id)) {
        summary.skippedLocked.push(so.id);
        continue;
      }
      const lines = (itemsBySo.get(so.id) ?? []).map((i) => ({
        productId: i.product_id,
        quantity: i.quantity,
        sliced: i.sliced,
      }));
      if (lines.length === 0) {
        summary.skippedEmpty.push(so.id);
        continue;
      }

      for (const date of dueDates(so, today)) {
        // Pre-check keeps the run quiet; the partial unique index is the real
        // guarantee against duplicates (and covers any race).
        const { data: existing } = await admin
          .from("orders")
          .select("id")
          .eq("standing_order_id", so.id)
          .eq("delivery_date", date)
          .maybeSingle();
        if (existing) {
          summary.alreadyPresent++;
          continue;
        }

        const res = await createOrderForCustomer({
          customerId: so.customer_id,
          lines,
          type: so.fulfillment_type,
          date,
          standingOrderId: so.id,
          skipUnavailable: true,
        });
        if (res.error) {
          if (/duplicate|unique/i.test(res.error)) summary.alreadyPresent++;
          else summary.errors.push({ standingOrderId: so.id, date, error: res.error });
        } else if (res.orderNumber !== undefined) {
          summary.created.push({
            standingOrderId: so.id,
            date,
            orderNumber: res.orderNumber,
          });
        }
      }
    }
  }

  // --- Reconcile: drop still-pending generated orders that shouldn't exist. ---
  // (date later skipped, standing order paused, or past its end date). Only
  // touches pending orders — anything already in processing/fulfilled is left.
  const { data: pendingData } = await admin
    .from("orders")
    .select("id, standing_order_id, delivery_date")
    .not("standing_order_id", "is", null)
    .eq("status", "pending")
    .gte("delivery_date", today);
  const pending = (pendingData ?? []) as {
    id: string;
    standing_order_id: string;
    delivery_date: string;
  }[];

  if (pending.length > 0) {
    const soIds = [...new Set(pending.map((p) => p.standing_order_id))];
    const { data: soData } = await admin
      .from("standing_orders")
      .select("*")
      .in("id", soIds);
    const soById = new Map(
      ((soData ?? []) as StandingOrder[]).map((s) => [s.id, s]),
    );

    for (const p of pending) {
      const so = soById.get(p.standing_order_id);
      const shouldCancel =
        !so ||
        !so.is_active ||
        (so.end_date !== null && p.delivery_date > so.end_date) ||
        so.skip_dates.includes(p.delivery_date);
      if (!shouldCancel) continue;
      const { error } = await admin.from("orders").delete().eq("id", p.id);
      if (!error) summary.canceled.push({ orderId: p.id, date: p.delivery_date });
    }
  }

  return summary;
}
