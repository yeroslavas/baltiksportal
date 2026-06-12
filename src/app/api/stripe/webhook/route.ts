import type Stripe from "stripe";
import { getStripe, stripeWebhookSecret } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { sendPaymentReceipt } from "@/lib/email";
import { formatPrice, formatDate } from "@/lib/format";

export const runtime = "nodejs"; // Stripe SDK needs Node crypto.
export const dynamic = "force-dynamic";

// Stripe → POST here on payment events. Verify the signature against the raw
// body, then mark the invoice paid. Card payments complete synchronously; ACH
// completes later via checkout.session.async_payment_succeeded — both land here.
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

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    // For ACH, `completed` arrives unpaid (still clearing); only act once paid.
    if (session.payment_status === "paid") {
      await markInvoicePaid(session);
    }
  }

  return Response.json({ received: true });
}

async function markInvoicePaid(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id;
  if (!invoiceId) return;
  const paymentIntentId =
    typeof session.payment_intent === "string"
      ? session.payment_intent
      : (session.payment_intent?.id ?? null);

  const admin = createAdminClient();
  // Idempotent: only unpaid/overdue → paid, so duplicate events don't re-email.
  const { data: updated } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_id: paymentIntentId,
    })
    .eq("id", invoiceId)
    .in("status", ["unpaid", "overdue"])
    .select("invoice_number, total_amount, paid_at, customer_id")
    .maybeSingle();
  if (!updated) return; // already paid / not found → nothing more to do

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
