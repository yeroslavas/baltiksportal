"use server";

import { headers } from "next/headers";
import { getUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer, priceOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { getOverdueInvoices } from "@/lib/invoices";
import { earliestFulfillmentDate } from "@/lib/order-cutoff";
import { isoWeekday } from "@/lib/standing-orders";
import { getStripe } from "@/lib/stripe";
import { formatDateOnly, formatPrice } from "@/lib/format";

const WEEKDAY_NAME = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

type CartLine = { productId: string; quantity: number; sliced?: boolean };
type Fulfillment = { type: string; date: string };
type PlaceOrderResult =
  | {
      orderId: string;
      orderNumber: number;
      checkoutUrl?: undefined;
      error?: undefined;
    }
  | {
      checkoutUrl: string;
      orderId?: undefined;
      orderNumber?: undefined;
      error?: undefined;
    }
  | {
      error: string;
      orderId?: undefined;
      orderNumber?: undefined;
      checkoutUrl?: undefined;
    };

export async function placeOrder(
  lines: CartLine[],
  fulfillment: Fulfillment,
): Promise<PlaceOrderResult> {
  const user = await getUser();
  if (!user) return { error: "Please sign in to place an order." };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Your cart is empty." };
  }

  const type =
    fulfillment?.type === "pickup"
      ? "pickup"
      : fulfillment?.type === "delivery"
        ? "delivery"
        : null;
  if (!type) return { error: "Please choose delivery or pickup." };
  const date = String(fulfillment?.date ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { error: "Please choose a valid date." };
  }

  // Customer-only ordering rules (admins exempt): cutoff + closed days.
  if (!isAdmin(user.email)) {
    const settings = await getSettings();
    if (settings.orderCutoffEnabled) {
      const earliest = earliestFulfillmentDate(
        new Date(),
        settings.orderCutoffHour,
      );
      if (date < earliest) {
        return {
          error: `Ordering for that date has closed. The earliest available date is ${formatDateOnly(earliest)}.`,
        };
      }
    }
    if (
      settings.availableDays.length > 0 &&
      !settings.availableDays.includes(isoWeekday(date))
    ) {
      return {
        error: `We're closed on ${WEEKDAY_NAME[isoWeekday(date) - 1]}s. Please choose another date.`,
      };
    }
  }

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, allow_invoicing, email")
    .eq("user_id", user.id)
    .maybeSingle<{
      id: string;
      allow_invoicing: boolean;
      email: string | null;
    }>();
  if (!customer) {
    return { error: "No customer profile is linked to your account." };
  }

  // Credit lock: a customer with past-due invoices can't place new orders until
  // they're paid (admins exempt). Unlock = pay them on the Invoices page.
  if (!isAdmin(user.email)) {
    const overdue = await getOverdueInvoices(customer.id, admin);
    if (overdue.length > 0) {
      const owed = overdue.reduce((s, i) => s + Number(i.total_amount), 0);
      return {
        error: `Your account has ${overdue.length} overdue invoice${
          overdue.length > 1 ? "s" : ""
        } (${formatPrice(owed)}). Please pay them on the Invoices page before placing a new order.`,
      };
    }
  }

  const cleanLines = lines.map((l) => ({
    productId: l.productId,
    quantity: l.quantity,
    sliced: Boolean(l.sliced),
  }));

  // Invoicing customers: create the order now and pay the invoice later.
  if (customer.allow_invoicing) {
    return createOrderForCustomer({
      customerId: customer.id,
      lines: cleanLines,
      type,
      date,
    });
  }

  // Non-invoicing customers must pay at checkout — the real order is created by
  // the Stripe webhook once payment is authorized. Price it, stash the cart,
  // and hand off to hosted Checkout.
  const priced = await priceOrder({
    customerId: customer.id,
    lines: cleanLines,
    type,
  });
  if ("error" in priced) return { error: priced.error };

  const { data: pending, error: pendErr } = await admin
    .from("pending_orders")
    .insert({
      customer_id: customer.id,
      lines: cleanLines,
      fulfillment_type: type,
      delivery_date: date,
      // Snapshot the priced order so the webhook materializes it at the exact
      // price charged, even if catalog prices change before ACH settles.
      priced,
    })
    .select("id")
    .single();
  if (pendErr || !pending) {
    return { error: pendErr?.message ?? "Could not start checkout." };
  }

  const h = await headers();
  const host = h.get("host") ?? "";
  const proto =
    h.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  let checkoutUrl: string | null = null;
  let payError: string | null = null;
  try {
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      // ACH (preferred) or card. No surcharge — we absorb card fees; US rules
      // forbid surcharging debit, which hosted Checkout can't distinguish.
      payment_method_types: ["us_bank_account", "card"],
      customer_creation: "always",
      customer_email: customer.email ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: Math.round(priced.total * 100),
            product_data: { name: "Baltik's Bagel order" },
          },
        },
      ],
      metadata: { pending_order_id: pending.id },
      payment_intent_data: { metadata: { pending_order_id: pending.id } },
      success_url: `${origin}/checkout/success`,
      cancel_url: `${origin}/cart`,
    });
    checkoutUrl = session.url;
  } catch (e) {
    console.error("Pay-first checkout session creation failed:", e);
    payError = e instanceof Error ? e.message : "Could not start checkout.";
  }

  if (!checkoutUrl) {
    await admin.from("pending_orders").delete().eq("id", pending.id);
    return { error: payError ?? "Could not start checkout." };
  }
  return { checkoutUrl };
}
