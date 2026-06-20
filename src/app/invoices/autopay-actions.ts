"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/autopay";

async function originFromHeaders(): Promise<string> {
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

// Resolve the signed-in user's customer row (autopay is customer self-service).
async function currentCustomer() {
  const user = await getUser();
  if (!user) redirect("/login");
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, email, business_name, autopay_payment_method_id")
    .eq("user_id", user.id)
    .maybeSingle<{
      id: string;
      email: string | null;
      business_name: string;
      autopay_payment_method_id: string | null;
    }>();
  if (!customer) redirect("/invoices");
  return { admin, customer };
}

// Start the hosted "Set up auto-pay" flow: a Stripe Checkout SETUP session that
// collects + saves the customer's bank account and the ACH mandate. The webhook
// finishes it (saves the payment method + enables auto-pay).
export async function startAutopaySetup(): Promise<void> {
  const { customer } = await currentCustomer();
  const stripeCustomerId = await getOrCreateStripeCustomer({
    customerId: customer.id,
    email: customer.email,
    businessName: customer.business_name,
  });
  const origin = await originFromHeaders();

  let url: string | null = null;
  let error: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["us_bank_account"],
      customer: stripeCustomerId,
      metadata: { autopay_customer_id: customer.id },
      setup_intent_data: { metadata: { autopay_customer_id: customer.id } },
      success_url: `${origin}/invoices?autopay=on`,
      cancel_url: `${origin}/invoices`,
    });
    url = session.url;
  } catch (e) {
    console.error("Auto-pay setup session failed:", e);
    error = e instanceof Error ? e.message : "Could not start auto-pay setup.";
  }

  if (url) redirect(url);
  redirect(`/invoices?autopayerror=${encodeURIComponent(error ?? "Could not start auto-pay setup.")}`);
}

// Turn off auto-pay: detach the saved bank from Stripe and clear our flags.
export async function disableAutopay(): Promise<void> {
  const { admin, customer } = await currentCustomer();
  if (customer.autopay_payment_method_id) {
    try {
      await getStripe().paymentMethods.detach(customer.autopay_payment_method_id);
    } catch (e) {
      console.error("Auto-pay payment-method detach failed:", e);
    }
  }
  await admin
    .from("customers")
    .update({
      autopay_enabled: false,
      autopay_payment_method_id: null,
      autopay_bank_last4: null,
      autopay_fail_count: 0,
    })
    .eq("id", customer.id);
  revalidatePath("/invoices");
  redirect("/invoices?autopay=off");
}
