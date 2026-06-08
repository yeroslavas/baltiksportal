"use server";

import { getUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

type CartLine = { productId: string; quantity: number };
type PlaceOrderResult =
  | { orderId: string; orderNumber: number; error?: undefined }
  | { error: string; orderId?: undefined; orderNumber?: undefined };

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function placeOrder(lines: CartLine[]): Promise<PlaceOrderResult> {
  const user = await getUser();
  if (!user) return { error: "Please sign in to place an order." };
  if (!Array.isArray(lines) || lines.length === 0) {
    return { error: "Your cart is empty." };
  }

  const admin = createAdminClient();

  // Resolve this user's customer record (we own the user, so this is the trust
  // anchor — everything below is computed for THIS customer).
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
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

  const total = round2(orderItems.reduce((s, i) => s + i.line_total, 0));

  // Create the order, then its items — roll the order back if items fail.
  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert({ customer_id: customer.id, total_amount: total })
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
