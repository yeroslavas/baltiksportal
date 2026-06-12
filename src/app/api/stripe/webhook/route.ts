import type Stripe from "stripe";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { sendPaymentReceipt } from "@/lib/email";
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
    }>();
  if (!pending) return; // already consumed / gone

  const res = await createOrderForCustomer({
    customerId: pending.customer_id,
    lines: pending.lines ?? [],
    type: pending.fulfillment_type,
    date: pending.delivery_date,
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

// Mark an invoice paid + email a receipt. Finds it by metadata.invoice_id
// (pay-existing) or by the PaymentIntent tagged at materialization (pay-first).
async function markPaid(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id;
  const pi = paymentIntentId(session);

  const admin = createAdminClient();
  let q = admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_id: pi,
    })
    .in("status", ["unpaid", "overdue"]); // idempotent: no double-email
  if (invoiceId) q = q.eq("id", invoiceId);
  else if (pi) q = q.eq("stripe_payment_id", pi);
  else return;

  const { data: updated } = await q
    .select("invoice_number, total_amount, paid_at, customer_id")
    .maybeSingle();
  if (!updated) return; // already paid / not found

  const [{ data: customer }, settings] = await Promise.all([
    admin
      .from("customers")
      .select("email")
      .eq("id", updated.customer_id)
      .maybeSingle<{ email: string | null }>(),
    getSettings(),
  ]);
  if (customer?.email) {
    await sendPaymentReceipt({
      to: customer.email,
      invoiceNumber: updated.invoice_number,
      amountDisplay: formatPrice(Number(updated.total_amount)),
      dateDisplay: formatDate(updated.paid_at),
      businessName: settings.businessName,
    });
  }
}
