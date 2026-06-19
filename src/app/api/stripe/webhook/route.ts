import type Stripe from "stripe";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer, type PricedOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { sendPaymentReceipt, sendAdminPaymentFailedAlert } from "@/lib/email";
import { formatPrice, formatDate } from "@/lib/format";

export const runtime = "nodejs"; // Stripe SDK needs Node crypto.
export const dynamic = "force-dynamic";

// Stripe → POST here on payment events. Two flows land here:
//  • pay an existing invoice  → metadata.invoice_id  → mark that invoice paid.
//  • pay-first checkout       → metadata.pending_order_id → create the order on
//    authorization (completed), then mark its invoice paid when settled.
// Card settles synchronously (completed=paid); ACH settles later via
// async_payment_succeeded — both reconcile here. Idempotent throughout.
export async function POST(req: Request): Promise<Response> {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const body = await req.text(); // raw body required for signature check
  let event: Stripe.Event;
  try {
    event = await getStripe().webhooks.constructEventAsync(
      body,
      sig,
      stripeWebhookSecret(),
    );
  } catch (err) {
    console.error("Stripe webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    // Create the order as soon as payment is authorized (card OR ACH).
    if (session.metadata?.pending_order_id) {
      await materializePendingOrder(session);
    }
    // Card payments are settled at this point — mark paid now.
    if (session.payment_status === "paid") {
      await markPaid(session);
    }
  } else if (event.type === "checkout.session.async_payment_succeeded") {
    // ACH cleared. The order already exists (materialized on completion, or it's
    // a pay-existing-invoice). Mark it paid.
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status === "paid") {
      await markPaid(session);
    }
  } else if (event.type === "checkout.session.async_payment_failed") {
    // ACH bounced/returned (NSF, closed account, revoked mandate). We don't
    // auto-cancel (the order may already be in production) — we flag the
    // invoice and alert the admin to follow up.
    await flagPaymentFailed(event.data.object as Stripe.Checkout.Session);
  } else if (event.type === "checkout.session.expired") {
    // Abandoned pay-first checkout — the order was never created. Clean up the
    // stale hold so it doesn't linger.
    const session = event.data.object as Stripe.Checkout.Session;
    const pendingId = session.metadata?.pending_order_id;
    if (pendingId) {
      await createAdminClient()
        .from("pending_orders")
        .delete()
        .eq("id", pendingId);
    }
  }

  return Response.json({ received: true });
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  return typeof session.payment_intent === "string"
    ? session.payment_intent
    : (session.payment_intent?.id ?? null);
}

// Create the real order for a pay-first checkout, once payment is authorized.
async function materializePendingOrder(session: Stripe.Checkout.Session) {
  const pendingId = session.metadata?.pending_order_id;
  const pi = paymentIntentId(session);
  if (!pendingId || !pi) return;

  const admin = createAdminClient();

  // Idempotent: if an invoice already carries this PaymentIntent, the order was
  // already created by an earlier (retried/duplicate) delivery → stop.
  const { data: existing } = await admin
    .from("invoices")
    .select("id")
    .eq("stripe_payment_id", pi)
    .maybeSingle();
  if (existing) return;

  const { data: pending } = await admin
    .from("pending_orders")
    .select("*")
    .eq("id", pendingId)
    .maybeSingle<{
      customer_id: string;
      lines: { productId: string; quantity: number }[];
      fulfillment_type: "delivery" | "pickup";
      delivery_date: string;
      priced: PricedOrder | null;
    }>();
  if (!pending) return; // already consumed / gone

  const res = await createOrderForCustomer({
    customerId: pending.customer_id,
    lines: pending.lines ?? [],
    type: pending.fulfillment_type,
    date: pending.delivery_date,
    // Materialize at the exact price charged (falls back to re-pricing for
    // older pending rows written before the snapshot existed).
    priced: pending.priced ?? undefined,
  });
  if (res.error || !res.orderId) {
    // Leave the pending row as evidence for manual recovery (customer paid).
    console.error(
      `Pay-first order materialization failed (pending ${pendingId}): ${res.error}`,
    );
    return;
  }

  // Tag the new invoice with the PaymentIntent so markPaid() can find it.
  await admin
    .from("invoices")
    .update({ stripe_payment_id: pi })
    .eq("order_id", res.orderId);
  await admin.from("pending_orders").delete().eq("id", pendingId);
}

// Mark the invoice(s) this payment covers paid, + email one receipt. Finds them
// by metadata.invoice_id (single), metadata.batch_id (bulk), or the PaymentIntent
// tagged at materialization (pay-first). Idempotent.
async function markPaid(session: Stripe.Checkout.Session) {
  const pi = paymentIntentId(session);
  const invoiceId = session.metadata?.invoice_id;
  const batchId = session.metadata?.batch_id;

  const admin = createAdminClient();

  let targetIds: string[] = [];
  if (invoiceId) {
    targetIds = [invoiceId];
  } else if (batchId) {
    const { data: batch } = await admin
      .from("payment_batches")
      .select("invoice_ids")
      .eq("id", batchId)
      .maybeSingle<{ invoice_ids: string[] }>();
    targetIds = batch?.invoice_ids ?? [];
  } else if (pi) {
    // pay-first: the materialized invoice was tagged with this PaymentIntent.
    const { data: tagged } = await admin
      .from("invoices")
      .select("id")
      .eq("stripe_payment_id", pi);
    targetIds = (tagged ?? []).map((t) => t.id);
  }
  if (targetIds.length === 0) return;

  const { data: updated } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_id: pi,
    })
    .in("id", targetIds)
    .in("status", ["unpaid", "overdue"]) // idempotent: no double-email
    .select("invoice_number, total_amount, customer_id");
  const paid = updated ?? [];
  if (paid.length === 0) return; // already paid / not found

  // One receipt summarising the payment (single invoice or the whole batch).
  const settings = await getSettings();
  const { data: customer } = await admin
    .from("customers")
    .select("email")
    .eq("id", paid[0].customer_id)
    .maybeSingle<{ email: string | null }>();
  if (customer?.email) {
    const totalPaid = paid.reduce((s, r) => s + Number(r.total_amount), 0);
    const label =
      paid.length === 1
        ? `Invoice ${paid[0].invoice_number}`
        : `${paid.length} invoices`;
    await sendPaymentReceipt({
      to: customer.email,
      invoiceNumber: label,
      amountDisplay: formatPrice(totalPaid),
      dateDisplay: formatDate(new Date().toISOString()),
      businessName: settings.businessName,
    });
  }
}

// Resolve which invoices a session's payment covers (single / batch / pay-first).
async function invoiceIdsForSession(
  admin: ReturnType<typeof createAdminClient>,
  session: Stripe.Checkout.Session,
): Promise<string[]> {
  const invoiceId = session.metadata?.invoice_id;
  const batchId = session.metadata?.batch_id;
  const pi = paymentIntentId(session);
  if (invoiceId) return [invoiceId];
  if (batchId) {
    const { data: batch } = await admin
      .from("payment_batches")
      .select("invoice_ids")
      .eq("id", batchId)
      .maybeSingle<{ invoice_ids: string[] }>();
    return batch?.invoice_ids ?? [];
  }
  if (pi) {
    const { data: tagged } = await admin
      .from("invoices")
      .select("id")
      .eq("stripe_payment_id", pi);
    return (tagged ?? []).map((t) => t.id);
  }
  return [];
}

// ACH failed/returned: flag the still-unpaid invoice(s) with a note (don't
// cancel — the order may already be in production) and alert the admin.
async function flagPaymentFailed(session: Stripe.Checkout.Session) {
  const admin = createAdminClient();
  const targetIds = await invoiceIdsForSession(admin, session);
  if (targetIds.length === 0) return;

  const note = `⚠ ACH payment failed/returned ${formatDate(new Date().toISOString())} — follow up`;
  const { data: flagged } = await admin
    .from("invoices")
    .update({ payment_note: note })
    .in("id", targetIds)
    .in("status", ["unpaid", "overdue"]) // don't touch already-paid/canceled
    .select("invoice_number, total_amount, customer_id");
  const rows = flagged ?? [];
  if (rows.length === 0) return;

  const settings = await getSettings();
  const { data: customer } = await admin
    .from("customers")
    .select("business_name")
    .eq("id", rows[0].customer_id)
    .maybeSingle<{ business_name: string | null }>();
  const totalFailed = rows.reduce((s, r) => s + Number(r.total_amount), 0);
  await sendAdminPaymentFailedAlert({
    invoiceLabel:
      rows.length === 1 ? rows[0].invoice_number : `${rows.length} invoices`,
    customerName: customer?.business_name ?? "a customer",
    amountDisplay: formatPrice(totalFailed),
    businessName: settings.businessName,
  });
}
