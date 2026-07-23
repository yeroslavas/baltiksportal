"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInvoiceForOrder,
  markOverdueInvoices,
  invoiceAmountDue,
} from "@/lib/invoices";
import { runAutopayCharges } from "@/lib/autopay-run";
import { reconcilePaymentsInFlight } from "@/lib/reconcile";
import { formatPrice } from "@/lib/format";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/types";

export type RunAutopayState = { message: string | null; error: string | null };

// Run the auto-pay charge cycle on demand (manual fallback for the daily cron).
// Idempotent — invoices already mid-charge are skipped.
export async function runAutopayNow(
  _prev: RunAutopayState,
  _formData: FormData,
): Promise<RunAutopayState> {
  await requireAdmin();
  const s = await runAutopayCharges();
  revalidatePath("/admin/invoices");

  const base =
    s.charged > 0
      ? `Charged ${s.charged} invoice${s.charged === 1 ? "" : "s"}.`
      : "No invoices were due for auto-pay.";
  const extra: string[] = [];
  if (s.skipped) extra.push(`${s.skipped} skipped`);
  if (s.failed) extra.push(`${s.failed} failed`);
  return {
    message: extra.length ? `${base} (${extra.join(", ")})` : base,
    error: s.errors.length ? s.errors.slice(0, 3).join("; ") : null,
  };
}

export type ReconcileState = { message: string | null; error: string | null };

// Reconcile every payment "in flight" against Stripe's actual PaymentIntent
// status (manual trigger for the reconcile cron). Fixes invoices whose in-flight
// tag got stuck — marks cleared ACH paid, clears declined/returned ones (which
// re-applies the credit stop). Idempotent.
export async function reconcilePaymentsNow(
  _prev: ReconcileState,
  _formData: FormData,
): Promise<ReconcileState> {
  await requireAdmin();
  const s = await reconcilePaymentsInFlight();
  revalidatePath("/admin/invoices");

  if (s.checked === 0) {
    return { message: "No payments in flight to reconcile.", error: null };
  }
  const parts: string[] = [];
  if (s.markedPaid) parts.push(`${s.markedPaid} marked paid`);
  if (s.markedFailed) parts.push(`${s.markedFailed} cleared (failed)`);
  if (s.stillProcessing) parts.push(`${s.stillProcessing} still processing`);
  const base = `Checked ${s.checked} in-flight payment${s.checked === 1 ? "" : "s"}`;
  return {
    message: parts.length ? `${base}: ${parts.join(", ")}.` : `${base}.`,
    error: s.errors.length ? s.errors.slice(0, 3).join("; ") : null,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type CreditState = { error: string | null; success: string | null };

// Apply an admin credit/adjustment to an unpaid invoice (shorted/damaged order,
// pricing fix). Accumulates onto any existing credit and reduces the amount due;
// a credit that covers the whole balance settles the invoice ("paid by credit")
// so it stops locking the customer / showing as outstanding.
export async function applyCredit(
  _prev: CreditState,
  formData: FormData,
): Promise<CreditState> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Missing invoice.", success: null };
  const amount = Number(String(formData.get("amount") ?? "").replace(/[$,\s]/g, ""));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Enter a credit amount greater than 0.", success: null };
  }
  if (!reason) return { error: "Add a reason for the credit.", success: null };

  const admin = createAdminClient();
  const { data: inv } = await admin
    .from("invoices")
    .select("total_amount, credit_amount, credit_reason, status")
    .eq("id", id)
    .maybeSingle<{
      total_amount: number;
      credit_amount: number;
      credit_reason: string | null;
      status: string;
    }>();
  if (!inv) return { error: "Invoice not found.", success: null };
  if (inv.status === "paid" || inv.status === "canceled") {
    return { error: `Can't credit a ${inv.status} invoice.`, success: null };
  }

  const due = invoiceAmountDue(inv);
  if (amount > due + 0.001) {
    return {
      error: `Credit can't exceed the amount due (${formatPrice(due)}).`,
      success: null,
    };
  }

  const newCredit = round2(Number(inv.credit_amount ?? 0) + amount);
  const newDue = invoiceAmountDue({ total_amount: inv.total_amount, credit_amount: newCredit });
  const update: Record<string, unknown> = {
    credit_amount: newCredit,
    credit_reason: inv.credit_reason ? `${inv.credit_reason}; ${reason}` : reason,
  };
  // Full credit settles the invoice (Yero confirmed: auto-close).
  if (newDue <= 0) {
    update.status = "paid";
    update.paid_at = new Date().toISOString();
  }

  const { error } = await admin.from("invoices").update(update).eq("id", id);
  if (error) return { error: error.message, success: null };

  revalidatePath(`/admin/invoices/${id}`);
  revalidatePath("/admin/invoices");
  return {
    error: null,
    success:
      newDue <= 0
        ? `Credited ${formatPrice(amount)} — invoice settled by credit.`
        : `Credited ${formatPrice(amount)}. Amount due now ${formatPrice(newDue)}.`,
  };
}

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
      // Reverting off "paid" clears the Stripe tag, so the invoice isn't mistaken
      // for a payment-in-flight (which would skip the credit stop).
      ...(status !== "paid" ? { stripe_payment_id: null } : {}),
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
