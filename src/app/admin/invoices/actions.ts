"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createInvoiceForOrder, markOverdueInvoices } from "@/lib/invoices";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/types";

// Set an invoice's status (the admin "mark as paid" control, plus the ability to
// revert or force overdue). paid_at is stamped when paid and cleared otherwise.
export async function setInvoiceStatus(formData: FormData) {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "") as InvoiceStatus;
  if (!id || !INVOICE_STATUSES.includes(status)) return;

  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", id);

  revalidatePath("/admin/invoices");
  revalidatePath(`/admin/invoices/${id}`);
}

export type NoteState = { saved: boolean };

// Save the internal payment note on an invoice (e.g. a check number). Blank
// clears it. Admin-only; never exposed to the customer.
export async function updateInvoiceNote(
  _prev: NoteState,
  formData: FormData,
): Promise<NoteState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { saved: false };
  const note = String(formData.get("payment_note") ?? "").trim();

  const admin = createAdminClient();
  await admin
    .from("invoices")
    .update({ payment_note: note || null })
    .eq("id", id);

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
  return { saved: true };
}

export type OverdueState = { message: string | null; error: string | null };

// Sweep unpaid, past-due invoices to "overdue". Manual fallback for the nightly
// overdue-invoices cron.
export async function recomputeOverdue(
  _prev: OverdueState,
  _formData: FormData,
): Promise<OverdueState> {
  await requireAdmin();
  try {
    const count = await markOverdueInvoices();
    revalidatePath("/admin/invoices");
    return {
      message:
        count === 0
          ? "No invoices became overdue."
          : `${count} invoice${count === 1 ? "" : "s"} marked overdue.`,
      error: null,
    };
  } catch (e) {
    return {
      message: null,
      error: e instanceof Error ? e.message : "Failed to update overdue invoices.",
    };
  }
}

export type GenerateInvoiceState = { message: string | null; error: string | null };

// Manually generate the invoice for an order that doesn't have one yet (the
// "admin triggers it" path). Idempotent — reports if one already exists.
export async function generateInvoiceForOrder(
  _prev: GenerateInvoiceState,
  formData: FormData,
): Promise<GenerateInvoiceState> {
  await requireAdmin();

  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { message: null, error: "Missing order." };

  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, customer_id, total_amount")
    .eq("id", orderId)
    .maybeSingle<{ id: string; customer_id: string; total_amount: number }>();
  if (!order) return { message: null, error: "Order not found." };

  const res = await createInvoiceForOrder({
    orderId: order.id,
    customerId: order.customer_id,
    total: Number(order.total_amount),
    admin,
  });
  if (res.outcome === "error") {
    return { message: null, error: res.error ?? "Could not create the invoice." };
  }

  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath("/admin/invoices");
  return {
    message:
      res.outcome === "exists"
        ? "An invoice already exists for this order."
        : "Invoice created.",
    error: null,
  };
}
