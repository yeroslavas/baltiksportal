// Payment reconciliation backstop. Webhooks can be missed or arrive in shapes we
// don't handle, which leaves an invoice's in-flight tag (stripe_payment_id set
// while still unpaid/overdue) STUCK: it reads "Payment Processing" forever and —
// worse — keeps the credit stop lifted (see getOverdueInvoices in
// src/lib/invoices.ts). This sweep re-derives the truth from Stripe for every
// in-flight invoice and corrects the portal to match:
//   • PI succeeded                       → mark the invoice paid
//   • PI failed/returned or canceled     → clear the tag + flag (re-locks account)
//   • PI still processing/awaiting action → leave it (genuinely in flight)
// Server-only (service_role + Stripe secret). No emails — the webhook path owns
// receipts/alerts, so this only corrects state and is safe to run repeatedly.

import "server-only";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate } from "@/lib/format";

export type ReconcileSummary = {
  checked: number;
  markedPaid: number;
  markedFailed: number;
  markedIncomplete: number;
  stillProcessing: number;
  errors: string[];
};

export async function reconcilePaymentsInFlight(): Promise<ReconcileSummary> {
  const admin = createAdminClient();
  const stripe = getStripe();
  const summary: ReconcileSummary = {
    checked: 0,
    markedPaid: 0,
    markedFailed: 0,
    markedIncomplete: 0,
    stillProcessing: 0,
    errors: [],
  };

  // Every invoice with a payment in flight: a Stripe id set while still owing.
  const { data, error } = await admin
    .from("invoices")
    .select("id, invoice_number, stripe_payment_id, status")
    .not("stripe_payment_id", "is", null)
    .in("status", ["unpaid", "overdue"]);
  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const rows = (data ?? []) as {
    id: string;
    invoice_number: string;
    stripe_payment_id: string;
    status: string;
  }[];

  for (const inv of rows) {
    summary.checked++;

    let pi: Stripe.PaymentIntent;
    try {
      pi = await stripe.paymentIntents.retrieve(inv.stripe_payment_id);
    } catch (e) {
      summary.errors.push(
        `${inv.invoice_number}: ${e instanceof Error ? e.message : "Stripe lookup failed"}`,
      );
      continue;
    }

    const now = formatDate(new Date().toISOString());
    if (pi.status === "succeeded") {
      // ACH cleared — the success webhook was missed; settle it now. (No receipt
      // email here; only the webhook path sends those.)
      const { data: updated } = await admin
        .from("invoices")
        .update({ status: "paid", paid_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("stripe_payment_id", inv.stripe_payment_id)
        .in("status", ["unpaid", "overdue"])
        .select("id");
      if (updated?.length) summary.markedPaid++;
    } else if (pi.status === "processing") {
      // Genuinely clearing (e.g. instant-verified ACH). Leave it in flight.
      summary.stillProcessing++;
    } else if (
      pi.status === "requires_action" ||
      pi.status === "requires_confirmation"
    ) {
      // Started but never completed — e.g. ACH micro-deposit verification that
      // the customer hasn't finished (Stripe shows "Incomplete"). It isn't
      // clearing and will expire. Clear the stuck tag (so it stops reading
      // "processing" and the credit stop re-applies) and mark it Incomplete (⏳).
      const { data: updated } = await admin
        .from("invoices")
        .update({
          stripe_payment_id: null,
          payment_note:
            `⏳ ACH payment not completed ${now} — bank verification pending; will expire if unfinished`.slice(
              0,
              480,
            ),
        })
        .eq("id", inv.id)
        .eq("stripe_payment_id", inv.stripe_payment_id)
        .in("status", ["unpaid", "overdue"])
        .select("id");
      if (updated?.length) summary.markedIncomplete++;
    } else {
      // canceled / requires_payment_method → hard-failed / returned / expired.
      // Clear the tag (re-applies the credit stop); flag it Declined (⚠).
      const reason = pi.last_payment_error?.message ?? "payment failed/returned";
      const { data: updated } = await admin
        .from("invoices")
        .update({
          stripe_payment_id: null,
          payment_note:
            `⚠ ACH payment failed/returned ${now} — ${reason}`.slice(0, 480),
        })
        .eq("id", inv.id)
        .eq("stripe_payment_id", inv.stripe_payment_id)
        .in("status", ["unpaid", "overdue"])
        .select("id");
      if (updated?.length) summary.markedFailed++;
    }
  }

  return summary;
}
