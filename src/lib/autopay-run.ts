// Auto-pay charge runner: charges invoices due (today or earlier) for customers
// with auto-pay enabled, off-session against their saved bank. Idempotent — only
// touches invoices with no charge in flight (stripe_payment_id IS NULL), tags
// each invoice with its PaymentIntent immediately so a later run won't re-charge
// while the ACH settles, and uses a per-invoice/day idempotency key. Server-only.

import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { businessToday } from "@/lib/standing-orders";
import { invoiceAmountDue } from "@/lib/invoices";
import { recordAutopayFailure } from "@/lib/autopay";

type Row = {
  id: string;
  invoice_number: string;
  total_amount: number;
  credit_amount: number;
  customer_id: string;
  customers: {
    stripe_customer_id: string | null;
    autopay_enabled: boolean;
    autopay_payment_method_id: string | null;
  } | null;
};

export type AutopaySummary = {
  charged: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function runAutopayCharges(): Promise<AutopaySummary> {
  const admin = createAdminClient();
  const today = businessToday();
  const summary: AutopaySummary = { charged: 0, skipped: 0, failed: 0, errors: [] };

  // Due (or past-due), still owing, and not already mid-charge.
  const { data, error } = await admin
    .from("invoices")
    .select(
      "id, invoice_number, total_amount, credit_amount, customer_id, " +
        "customers!inner(stripe_customer_id, autopay_enabled, autopay_payment_method_id)",
    )
    .in("status", ["unpaid", "overdue"])
    .lte("due_date", today)
    .is("stripe_payment_id", null);
  if (error) {
    summary.errors.push(error.message);
    return summary;
  }

  const rows = (data ?? []) as unknown as Row[];
  const stripe = getStripe();

  for (const inv of rows) {
    const c = inv.customers;
    if (!c?.autopay_enabled || !c.stripe_customer_id || !c.autopay_payment_method_id) {
      summary.skipped++;
      continue;
    }
    const amountDue = invoiceAmountDue(inv);
    if (amountDue <= 0) {
      summary.skipped++;
      continue;
    }

    try {
      const pi = await stripe.paymentIntents.create(
        {
          amount: Math.round(amountDue * 100),
          currency: "usd",
          customer: c.stripe_customer_id,
          payment_method: c.autopay_payment_method_id,
          payment_method_types: ["us_bank_account"],
          confirm: true,
          off_session: true,
          metadata: {
            autopay_invoice_id: inv.id,
            autopay_customer_id: inv.customer_id,
            invoice_number: inv.invoice_number,
          },
        },
        // Dedupe same-day reruns; a next-day retry gets a fresh key.
        { idempotencyKey: `autopay_${inv.id}_${today}` },
      );
      // Tag immediately so a later run won't re-charge while ACH settles.
      await admin
        .from("invoices")
        .update({ stripe_payment_id: pi.id })
        .eq("id", inv.id);
      summary.charged++;
    } catch (e) {
      // Synchronous confirm failure (e.g. detached/invalid bank). Treat as a
      // failed attempt (flags invoice, bumps counter, disables at the limit).
      const reason = e instanceof Error ? e.message : "charge failed";
      await recordAutopayFailure(inv.customer_id, inv.id, reason);
      summary.failed++;
      summary.errors.push(`${inv.invoice_number}: ${reason}`);
    }
  }

  return summary;
}
