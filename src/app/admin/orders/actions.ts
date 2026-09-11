"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { addDays } from "@/lib/standing-orders";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

export type AdminOrderResult =
  | { orderId: string; error?: undefined }
  | { error: string; orderId?: undefined };

// Place an order on a customer's behalf. Reuses the shared, server-authoritative
// core (their pricing, fee rules, window snapshot, auto-invoice). Goes straight
// through the core — so unlike customer checkout, it's not bound by the order
// cutoff or closed-days rules (the admin is intentionally overriding).
export async function createOrderAsAdmin(
  customerId: string,
  lines: { productId: string; quantity: number; sliced?: boolean }[],
  fulfillment: { type: string; date: string },
): Promise<AdminOrderResult> {
  await requireAdmin();

  if (!customerId) return { error: "Choose a customer." };
  const type =
    fulfillment?.type === "pickup"
      ? "pickup"
      : fulfillment?.type === "delivery"
        ? "delivery"
        : null;
  if (!type) return { error: "Choose delivery or pickup." };
  const date = String(fulfillment?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Choose a valid date." };
  }

  // Pass raw quantities through — createOrderForCustomer/priceOrder snaps each
  // to its product's allowed increment (0.5 for half-dozen items, whole else).
  const cleanLines = (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      productId: String(l?.productId ?? ""),
      quantity: Number(l?.quantity),
      sliced: Boolean(l?.sliced),
    }))
    .filter((l) => l.productId && Number.isFinite(l.quantity) && l.quantity > 0);
  if (cleanLines.length === 0) {
    return { error: "Add at least one item with a quantity." };
  }

  const res = await createOrderForCustomer({
    customerId,
    lines: cleanLines,
    type,
    date,
  });
  if (res.error || !res.orderId) {
    return { error: res.error ?? "Could not create the order." };
  }

  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { orderId: res.orderId };
}

export type FulfillmentEditState = { error: string | null; success: string | null };

const round2 = (n: number) => Math.round(n * 100) / 100;

// Correct an order's fulfillment details after the fact (wrong date keyed in,
// customer moved a delivery, delivery↔pickup swap). Deliberately allowed at ANY
// status — including fulfilled and canceled — because the point is to make the
// record match what actually happened, which is usually discovered afterwards.
//
// Items are never re-priced: order_items is an immutable snapshot of what was
// agreed, and re-pricing here would silently reprice an order against today's
// catalog. The only money that can move is the delivery fee, which is a function
// of fulfillment type — so it's recomputed from the STORED subtotal.
//
// Cascades to the invoice, which is the whole point: since net terms now run
// from the fulfillment date, changing the date without moving the due date would
// leave the invoice quietly wrong.
export async function updateOrderFulfillment(
  _prevState: FulfillmentEditState,
  formData: FormData,
): Promise<FulfillmentEditState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const type = String(formData.get("fulfillment_type") ?? "");
  const date = String(formData.get("delivery_date") ?? "").trim();
  const timeRaw = String(formData.get("delivery_time") ?? "").trim();
  const time = timeRaw === "" ? null : timeRaw;

  if (!id) return { error: "Missing order.", success: null };
  if (type !== "delivery" && type !== "pickup") {
    return { error: "Choose delivery or pickup.", success: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Choose a valid date.", success: null };
  }

  const admin = createAdminClient();

  const { data: order } = await admin
    .from("orders")
    .select(
      "id, order_number, customer_id, total_amount, delivery_fee, slice_fee, fulfillment_type, delivery_date, delivery_time",
    )
    .eq("id", id)
    .maybeSingle<{
      id: string;
      order_number: number;
      customer_id: string;
      total_amount: number;
      delivery_fee: number;
      slice_fee: number;
      fulfillment_type: string;
      delivery_date: string | null;
      delivery_time: string | null;
    }>();
  if (!order) return { error: "Order not found.", success: null };

  const { data: customer } = await admin
    .from("customers")
    .select("waive_delivery_minimum, invoice_terms_days")
    .eq("id", order.customer_id)
    .maybeSingle<{
      waive_delivery_minimum: boolean;
      invoice_terms_days: number | null;
    }>();

  // Delivery fee is the one figure that legitimately changes here. Derive the
  // goods subtotal from what's stored (total − delivery − slicing) rather than
  // re-pricing, then re-apply the same rule createOrderForCustomer/priceOrder
  // uses: charged only on delivery, below the minimum, and not waived.
  const sliceFee = Number(order.slice_fee) || 0;
  const subtotal = round2(
    Number(order.total_amount) - Number(order.delivery_fee) - sliceFee,
  );
  const settings = await getSettings();
  const newDeliveryFee =
    type === "delivery" &&
    !customer?.waive_delivery_minimum &&
    subtotal + sliceFee < settings.deliveryMinimum
      ? settings.deliveryFee
      : 0;
  const newTotal = round2(subtotal + newDeliveryFee + sliceFee);
  const totalChanged = newTotal !== Number(order.total_amount);

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, invoice_number, status, stripe_payment_id")
    .eq("order_id", id)
    .maybeSingle<{
      id: string;
      invoice_number: string;
      status: string;
      stripe_payment_id: string | null;
    }>();

  // Refuse to silently create a money discrepancy: if the fee swing would move
  // the total on an invoice that's already settled (or has an ACH payment in
  // flight), the admin needs to deal with the invoice deliberately — via a
  // credit or a refund — rather than have the amount shift under a payment.
  if (totalChanged && invoice) {
    const settled = invoice.status === "paid" || invoice.stripe_payment_id !== null;
    if (settled) {
      return {
        error: `Switching to ${type} would change the total from ${order.total_amount.toFixed(2)} to ${newTotal.toFixed(2)}, but invoice ${invoice.invoice_number} is already paid or has a payment in flight. Adjust the invoice first (credit or refund), then change the fulfillment type.`,
        success: null,
      };
    }
  }

  const { error: orderErr } = await admin
    .from("orders")
    .update({
      fulfillment_type: type,
      delivery_date: date,
      delivery_time: time,
      delivery_fee: newDeliveryFee,
      total_amount: newTotal,
    })
    .eq("id", id);
  if (orderErr) return { error: orderErr.message, success: null };

  // Keep the invoice in step. Due date is recomputed from the NEW fulfillment
  // date (see createInvoiceForOrder — same rule), but only while the invoice is
  // still open: a paid or canceled invoice is history and stays as issued.
  const notes: string[] = [];
  if (invoice && (invoice.status === "unpaid" || invoice.status === "overdue")) {
    const termsDays = customer?.invoice_terms_days ?? 7;
    const newDue = addDays(date, termsDays);
    const patch: Record<string, unknown> = { due_date: newDue };
    if (totalChanged) patch.total_amount = newTotal;
    const { error: invErr } = await admin
      .from("invoices")
      .update(patch)
      .eq("id", invoice.id);
    if (invErr) {
      notes.push(`order updated, but ${invoice.invoice_number} did not: ${invErr.message}`);
    } else {
      notes.push(`${invoice.invoice_number} now due ${newDue}`);
      if (totalChanged) notes.push(`total ${newTotal.toFixed(2)}`);
    }
  } else if (invoice) {
    notes.push(`${invoice.invoice_number} left as-is (${invoice.status})`);
  }

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/invoices");
  revalidatePath("/admin");

  return {
    error: null,
    success: `Saved.${notes.length ? ` ${notes.join(" · ")}.` : ""}`,
  };
}

export async function updateOrderStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  if (!id || !ORDER_STATUSES.includes(status)) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status }).eq("id", id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
}

// Soft-cancel an order: mark it canceled and void its invoice (kept on record,
// but out of outstanding balances and the overdue sweep). Reversible via
// reinstateOrder. A canceled standing-order instance stays in place, so the
// generator won't recreate it.
export async function cancelOrder(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status: "canceled" }).eq("id", id);
  await admin
    .from("invoices")
    .update({ status: "canceled", paid_at: null })
    .eq("order_id", id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/invoices");
}

// Undo a cancellation: restore the order to pending and its invoice to unpaid
// (the overdue sweep will re-flag it if it's already past due).
export async function reinstateOrder(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const admin = createAdminClient();
  await admin.from("orders").update({ status: "pending" }).eq("id", id);
  await admin
    .from("invoices")
    .update({ status: "unpaid" })
    .eq("order_id", id);

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${id}`);
  revalidatePath("/admin/invoices");
}
