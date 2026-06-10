// Shared, server-authoritative order creation. Used by both customer checkout
// and the standing-order generator, so pricing/fees/snapshots are computed in
// exactly one place. Server-only (uses the service_role key) — never import
// from a client component.

import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { createInvoiceForOrder } from "@/lib/invoices";

const round2 = (n: number) => Math.round(n * 100) / 100;

export type OrderLine = { productId: string; quantity: number };

export type CreateOrderResult =
  | { orderId: string; orderNumber: number; error?: undefined }
  | { error: string; orderId?: undefined; orderNumber?: undefined };

export async function createOrderForCustomer(opts: {
  customerId: string;
  lines: OrderLine[];
  type: "delivery" | "pickup";
  date: string; // YYYY-MM-DD
  // Set when generated from a standing order (links the order back to it).
  standingOrderId?: string;
  // Standing-order generation prefers to drop unavailable items rather than
  // fail the whole order; checkout keeps the strict behavior (default).
  skipUnavailable?: boolean;
}): Promise<CreateOrderResult> {
  const { customerId, type, date, standingOrderId, skipUnavailable } = opts;
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("id, waive_delivery_minimum, delivery_window")
    .eq("id", customerId)
    .maybeSingle<{
      id: string;
      waive_delivery_minimum: boolean;
      delivery_window: string | null;
    }>();
  if (!customer) return { error: "Customer not found." };

  // Normalise quantities; collect product ids.
  const qtyByProduct = new Map<string, number>();
  for (const line of opts.lines) {
    const qty = Math.floor(Number(line.quantity));
    if (!line.productId || !Number.isFinite(qty) || qty <= 0) {
      return { error: "This order has an invalid item." };
    }
    qtyByProduct.set(
      line.productId,
      (qtyByProduct.get(line.productId) ?? 0) + qty,
    );
  }
  if (qtyByProduct.size === 0) return { error: "There are no items to order." };
  const productIds = [...qtyByProduct.keys()];

  // Prices resolved SERVER-SIDE from the catalog + this customer's overrides.
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
      if (skipUnavailable) continue;
      return {
        error:
          "An item in this order is no longer available. Please review it.",
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
  if (orderItems.length === 0) {
    return { error: "None of the items are currently available." };
  }

  const subtotal = round2(orderItems.reduce((s, i) => s + i.line_total, 0));
  // Delivery fee applies only to delivery orders below the (admin-set) minimum,
  // unless the customer is exempt.
  const settings = await getSettings();
  const deliveryFee =
    type === "delivery" &&
    !customer.waive_delivery_minimum &&
    subtotal < settings.deliveryMinimum
      ? settings.deliveryFee
      : 0;
  const total = round2(subtotal + deliveryFee);

  // Omit standing_order_id entirely when absent, so checkout doesn't depend on
  // that column existing (keeps this safe to deploy ahead of the migration).
  const orderRow: Record<string, unknown> = {
    customer_id: customer.id,
    total_amount: total,
    delivery_fee: deliveryFee,
    fulfillment_type: type,
    delivery_date: date,
    delivery_time: customer.delivery_window, // the customer's assigned window
  };
  if (standingOrderId) orderRow.standing_order_id = standingOrderId;

  const { data: order, error: orderErr } = await admin
    .from("orders")
    .insert(orderRow)
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

  // Auto-generate the invoice. Best-effort: the order is the source of truth, so
  // an invoicing failure never fails the order — an admin can regenerate it from
  // the order page. Idempotent via the unique order_id (safe if this path or the
  // generator runs twice).
  const invoiceRes = await createInvoiceForOrder({
    orderId: order.id,
    customerId: customer.id,
    total,
    admin,
  });
  if (invoiceRes.outcome === "error") {
    console.error(
      `Invoice generation failed for order ${order.id}: ${invoiceRes.error}`,
    );
  }

  return { orderId: order.id, orderNumber: order.order_number as number };
}
