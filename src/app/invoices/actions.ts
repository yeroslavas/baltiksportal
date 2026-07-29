"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getStripe } from "@/lib/stripe";
import { getOrCreateStripeCustomer } from "@/lib/autopay";
import { invoiceAmountDue } from "@/lib/invoices";

// Create a hosted Stripe Checkout session for an invoice and redirect to it.
// Verifies the invoice belongs to the signed-in customer and is payable.
export async function payInvoice(formData: FormData) {
  const id = String(formData.get("invoice_id") ?? "");
  const user = await getUser();
  if (!user || !id) redirect("/login");

  const admin = createAdminClient();

  // Trust anchor: resolve THIS user's customer record.
  const { data: customer } = await admin
    .from("customers")
    .select("id, email, business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; email: string | null; business_name: string }>();
  if (!customer) redirect("/invoices");

  const { data: invoice } = await admin
    .from("invoices")
    .select("id, invoice_number, customer_id, total_amount, credit_amount, status")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      invoice_number: string;
      customer_id: string;
      total_amount: number;
      credit_amount: number;
      status: string;
    }>();
  if (!invoice || invoice.customer_id !== customer.id) redirect("/invoices");
  if (invoice.status === "paid" || invoice.status === "canceled") {
    redirect(`/invoices/${id}`);
  }
  // Charge the amount actually owed (total minus any admin credit).
  const amountDue = invoiceAmountDue(invoice);
  if (amountDue <= 0) redirect(`/invoices/${id}`); // fully credited — nothing to pay

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  // Create the session in a try/catch and capture the result; the redirect()
  // calls MUST be outside the try (redirect throws, which a catch would swallow).
  let checkoutUrl: string | null = null;
  let payError: string | null = null;
  try {
    // ONE persistent Stripe customer per portal customer (same as auto-pay), so
    // the bank they connect is SAVED and offered one-click next time — instead
    // of re-connecting + re-verifying (micro-deposits) on every payment.
    const stripeCustomerId = await getOrCreateStripeCustomer({
      customerId: customer.id,
      email: customer.email,
      businessName: customer.business_name,
    });
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["us_bank_account"],
      customer: stripeCustomerId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(amountDue * 100),
            product_data: { name: `Invoice ${invoice.invoice_number}` },
          },
        },
      ],
      metadata: {
        invoice_id: invoice.id,
        invoice_number: invoice.invoice_number,
      },
      payment_intent_data: {
        metadata: {
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
        },
        // Save the bank + mandate so it's reusable (no re-verification next time).
        setup_future_usage: "on_session",
      },
      success_url: `${origin}/invoices/${id}?paid=1`,
      cancel_url: `${origin}/invoices/${id}`,
    });
    checkoutUrl = session.url;
  } catch (e) {
    console.error("Stripe checkout session creation failed:", e);
    payError = e instanceof Error ? e.message : "Could not start the payment.";
  }

  if (checkoutUrl) redirect(checkoutUrl);
  redirect(
    `/invoices/${id}?payerror=${encodeURIComponent(payError ?? "Could not start the payment.")}`,
  );
}

// Pay several invoices in one Stripe Checkout. Validates each belongs to the
// customer and is payable; the webhook marks them all paid via the batch record.
export async function payInvoices(formData: FormData) {
  const user = await getUser();
  if (!user) redirect("/login");
  const ids = formData.getAll("invoice_ids").map(String).filter(Boolean);
  if (ids.length === 0) redirect("/invoices");

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, email, business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; email: string | null; business_name: string }>();
  if (!customer) redirect("/invoices");

  // Only this customer's own, still-payable invoices (and with a balance left
  // after any credit).
  const { data: invoiceData } = await admin
    .from("invoices")
    .select("id, invoice_number, total_amount, credit_amount")
    .in("id", ids)
    .eq("customer_id", customer.id)
    .in("status", ["unpaid", "overdue"]);
  const payable = (invoiceData ?? [])
    .map((i) => ({ ...i, amount_due: invoiceAmountDue(i) }))
    .filter((i) => i.amount_due > 0);
  if (payable.length === 0) redirect("/invoices");

  const { data: batch, error: batchErr } = await admin
    .from("payment_batches")
    .insert({ customer_id: customer.id, invoice_ids: payable.map((i) => i.id) })
    .select("id")
    .single();
  if (batchErr || !batch) {
    redirect(
      `/invoices?payerror=${encodeURIComponent(batchErr?.message ?? "Could not start the payment.")}`,
    );
  }

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  let checkoutUrl: string | null = null;
  let payError: string | null = null;
  try {
    const stripeCustomerId = await getOrCreateStripeCustomer({
      customerId: customer.id,
      email: customer.email,
      businessName: customer.business_name,
    });
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["us_bank_account"],
      customer: stripeCustomerId,
      line_items: payable.map((i) => ({
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(i.amount_due * 100),
          product_data: { name: `Invoice ${i.invoice_number}` },
        },
      })),
      metadata: { batch_id: batch.id },
      payment_intent_data: {
        metadata: { batch_id: batch.id },
        // Save the bank + mandate so it's reusable (no re-verification next time).
        setup_future_usage: "on_session",
      },
      success_url: `${origin}/invoices?paid=1`,
      cancel_url: `${origin}/invoices`,
    });
    checkoutUrl = session.url;
  } catch (e) {
    console.error("Bulk-pay checkout session creation failed:", e);
    payError = e instanceof Error ? e.message : "Could not start the payment.";
  }

  if (!checkoutUrl) {
    await admin.from("payment_batches").delete().eq("id", batch.id);
    redirect(
      `/invoices?payerror=${encodeURIComponent(payError ?? "Could not start the payment.")}`,
    );
  }
  redirect(checkoutUrl);
}
