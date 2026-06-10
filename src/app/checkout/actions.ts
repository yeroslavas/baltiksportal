"use server";

import { getUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { createOrderForCustomer } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { earliestFulfillmentDate } from "@/lib/order-cutoff";
import { formatDateOnly } from "@/lib/format";

type CartLine = { productId: string; quantity: number };
type Fulfillment = { type: string; date: string };
type PlaceOrderResult =
  | { orderId: string; orderNumber: number; error?: undefined }
  | { error: string; orderId?: undefined; orderNumber?: undefined };

export async function placeOrder(
  lines: CartLine[],
  fulfillment: Fulfillment,
): Promise<PlaceOrderResult> {
  const user = await getUser();
  if (!user) return { error: "Please sign in to place an order." };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Your cart is empty." };
  }

  // Fulfillment details — all required, validated server-side.
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

  // Enforce the next-day cutoff for customers. Admins are exempt — they can
  // write orders for any date. Server-authoritative: the picker's `min` is only
  // a hint, so we re-check here (and it also catches a customer who lingered
  // past the cutoff with the page open).
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
  }

  // Resolve this user's customer record (the trust anchor — we own the user).
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!customer) {
    return { error: "No customer profile is linked to your account." };
  }

  return createOrderForCustomer({
    customerId: customer.id,
    lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    type,
    date,
  });
}
