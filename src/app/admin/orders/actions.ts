"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

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
