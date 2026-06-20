// Auto-pay helpers. Server-only (service_role + Stripe secret). Customers
// authorize ACH once (saved on a persistent Stripe Customer); invoices then
// charge off-session on their due date (see the autopay cron / charge logic).

import "server-only";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { invoiceAmountDue } from "@/lib/invoices";
import { formatPrice, formatDate } from "@/lib/format";
import {
  sendPaymentReceipt,
  sendAutopayFailedAlert,
  sendAutopayDisabledEmail,
} from "@/lib/email";

// Disable auto-pay after this many consecutive failed debits (Yero: 2).
const MAX_AUTOPAY_FAILURES = 2;

// Get (or lazily create + persist) the Stripe Customer for a portal customer.
// Today's one-off pay flows create throwaway Customers per session; auto-pay
// needs ONE stable Customer so the saved bank/mandate attaches to it.
export async function getOrCreateStripeCustomer(opts: {
  customerId: string;
  email: string | null;
  businessName: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("customers")
    .select("stripe_customer_id")
    .eq("id", opts.customerId)
    .maybeSingle<{ stripe_customer_id: string | null }>();
  if (data?.stripe_customer_id) return data.stripe_customer_id;

  const created = await getStripe().customers.create({
    email: opts.email ?? undefined,
    name: opts.businessName,
    metadata: { portal_customer_id: opts.customerId },
  });
  await admin
    .from("customers")
    .update({ stripe_customer_id: created.id })
    .eq("id", opts.customerId);
  return created.id;
}

// An auto-pay charge settled: mark the invoice paid, reset the failure counter,
// email the receipt. Idempotent (status filter) — safe on duplicate webhooks.
export async function recordAutopaySuccess(
  invoiceId: string,
  piId: string,
): Promise<void> {
  const admin = createAdminClient();
  const { data: rows } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_id: piId,
    })
    .eq("id", invoiceId)
    .in("status", ["unpaid", "overdue"])
    .select("invoice_number, total_amount, credit_amount, customer_id");
  const inv = rows?.[0];
  if (!inv) return; // already paid / not found

  await admin
    .from("customers")
    .update({ autopay_fail_count: 0 })
    .eq("id", inv.customer_id);

  const { data: cust } = await admin
    .from("customers")
    .select("email")
    .eq("id", inv.customer_id)
    .maybeSingle<{ email: string | null }>();
  if (cust?.email) {
    const settings = await getSettings();
    await sendPaymentReceipt({
      to: cust.email,
      invoiceNumber: inv.invoice_number,
      amountDisplay: formatPrice(invoiceAmountDue(inv)),
      dateDisplay: formatDate(new Date().toISOString()),
      businessName: settings.businessName,
    });
  }
}

// An auto-pay charge failed: clear the in-flight tag (so it can retry), flag the
// invoice, bump the consecutive-failure counter, and DISABLE auto-pay at the
// limit. Alerts the admin always; emails the customer on disable.
export async function recordAutopayFailure(
  customerId: string,
  invoiceId: string | null,
  reason: string,
): Promise<void> {
  const admin = createAdminClient();
  const when = formatDate(new Date().toISOString());

  if (invoiceId) {
    await admin
      .from("invoices")
      .update({
        stripe_payment_id: null, // allow a retry (until auto-pay disables)
        payment_note: `⚠ Auto-pay failed ${when}: ${reason}`.slice(0, 480),
      })
      .eq("id", invoiceId);
  }

  const { data: c } = await admin
    .from("customers")
    .select("autopay_fail_count, business_name, email")
    .eq("id", customerId)
    .maybeSingle<{
      autopay_fail_count: number;
      business_name: string;
      email: string | null;
    }>();
  const newCount = (c?.autopay_fail_count ?? 0) + 1;
  const disabled = newCount >= MAX_AUTOPAY_FAILURES;

  await admin
    .from("customers")
    .update({
      autopay_fail_count: newCount,
      ...(disabled ? { autopay_enabled: false } : {}),
    })
    .eq("id", customerId);

  const settings = await getSettings();
  await sendAutopayFailedAlert({
    customerName: c?.business_name ?? "a customer",
    reason,
    disabled,
    businessName: settings.businessName,
  });
  if (disabled && c?.email) {
    await sendAutopayDisabledEmail({
      to: c.email,
      businessName: settings.businessName,
    });
  }
}
