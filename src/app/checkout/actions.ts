"use server";

import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { DELIVERY_MINIMUM, DELIVERY_FEE } from "@/lib/types";

type CartLine = { productId: string; quantity: number };
type Fulfillment = { type: string; date: string };
type PlaceOrderResult =
  | { orderId: string; orderNumber: number; error?: undefined }
  | { error: string; orderId?: undefined; orderNumber?: undefined };

const round2 = (n: number) => Math.round(n * 100) / 100;

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

  const admin = createAdminClient();

  // Resolve this user's customer record (we own the user, so this is the trust
  // anchor — everything below is computed for THIS customer).
  const { data: customer } = await admin
    .from("customers")
    .select("id, waive_delivery_minimum, delivery_window")
    .eq("user_id", user.id)
    .maybeSingle<{
      id: string;
      waive_delivery_minimum: boolean;
      delivery_window: string | null;
    }>();
  if (!customer) {
    return { error: "No customer profile is linked to your account." };
  }

  // Normalise quantities; collect product ids.
  const qtyByProduct = new Map<string, number>();
  for (const line of lines) {
    const qty = Math.floor(Number(line.quantity));
    if (!line.productId || !Number.isFinite(qty) || qty <= 0) {
      return { error: "Your cart has an invalid item — please review it." };
    }
    qtyByProduct.set(
      line.productId,
      (qtyByProduct.get(line.productId) ?? 0) + qty,
    );
  }
  const productIds = [...qtyByProduct.keys()];

  // Prices resolved SERVER-SIDE from the catalog + this customer's overrides —
  // the client's prices are never trusted.
  const [{ data: products }, { data: pricing }] = await Promise.all([
    admin
      .from("products")
      .select("id, name, base_price, is_active")
      .in("id", productIds),
    admin
      .from("customer_pricing")
      .select("product_id, custom_price")
      .eq("customer_id", customer.id),
  ]);
  const overrides = new Map(
    (pricing ?? []).map((p) => [p.product_id, Number(p.custom_price)]),
  );
  const productById = new Map((products ?? []).map((p) => [p.id, p]));

  const orderItems: {
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }[] = [];
  for (const [productId, qty] of qtyByProduct) {
    const product = productById.get(productId);
    if (!product || !product.is_active) {
      return {
        error:
          "An item in your cart is no longer available. Please review your cart.",
      };
    }
    const unitPrice = round2(
      overrides.get(productId) ?? Number(product.base_price),
    );
    orderItems.push({
      product_id: productId,
      product_name: product.name, // snapshot at order time
      quantity: qty,
      unit_price: unitPrice,
      line_total: round2(unitPrice * qty),
    });
  }

  const subtotal = round2(orderItems.reduce((s, i) => s + i.line_total, 0));
  // Delivery fee applies only to delivery orders below the minimum, unless the
  // customer is exempt (waive_delivery_minimum).
  const deliveryFee =
    type === "delivery" &&
    !customer.waive_delivery_minimum &&
    subtotal < DELIVERY_MINIMUM
      ? DELIVERY_FEE
      : 0;
  const total = round2(subtotal + deliveryFee);

  // Create the order, then its items — roll the order back if items fail.
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({
      customer_id: customer.id,
      total_amount: total,
      delivery_fee: deliveryFee,
      fulfillment_type: type,
      delivery_date: date,
      delivery_time: customer.delivery_window, // the customer's assigned window
    })
    .select("id, order_number")
    .single();
  if (orderErr || !order) {
    return { error: orderErr?.message ?? "Could not create the order." };
  }

  const { error: itemsErr } = await admin
    .from("order_items")
    .insert(orderItems.map((i) => ({ order_id: order.id, ...i })));
  if (itemsErr) {
    await admin.from("orders").delete().eq("id", order.id);
    return { error: itemsErr.message };
  }

  return { orderId: order.id, orderNumber: order.order_number as number };
}
