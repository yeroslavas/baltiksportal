"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer } from "@/lib/orders";
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
  lines: { productId: string; quantity: number }[],
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

  const cleanLines = (Array.isArray(lines) ? lines : [])
    .map((l) => ({
      productId: String(l?.productId ?? ""),
      quantity: Math.floor(Number(l?.quantity)),
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
