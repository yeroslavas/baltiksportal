import Link from "next/link";
import { fromParam } from "@/lib/return-to";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDate, formatDateOnly } from "@/lib/format";
import { OrderStatusForm } from "../order-status-form";
import { CancelOrderButton } from "../cancel-order-button";
import { reinstateOrder } from "../actions";
import { GenerateInvoiceButton } from "../generate-invoice-button";
import { EditFulfillmentForm } from "../edit-fulfillment-form";
import { getSettings } from "@/lib/settings";
import {
  earliestFulfillmentDate,
  formatCutoffHour,
} from "@/lib/order-cutoff";
import {
  EditOrderItemsForm,
  type PricedProductOption,
} from "../edit-order-items-form";
import type { Product } from "@/lib/types";
import { StatusBadge } from "@/components/status-badge";
import { StandingOrderBadge } from "@/components/standing-order-badge";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import type { Invoice, Order, OrderItem } from "@/lib/types";

type OrderWithCustomer = Order & {
  customers: {
    business_name: string;
    contact_name: string | null;
    email: string | null;
  } | null;
};

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("*, customers(business_name, contact_name, email)")
    .eq("id", id)
    .maybeSingle<OrderWithCustomer>();

  if (!order) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Order not found
        </h1>
        <Link
          href="/admin/orders"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to orders
        </Link>
      </div>
    );
  }

  const { data: itemsData } = await admin
    .from("order_items")
    .select("*")
    .eq("order_id", id);
  const items = (itemsData ?? []) as OrderItem[];

  // Offered delivery/pickup windows, for the fulfillment editor's dropdown.
  const settings = await getSettings();

  // Catalog at this customer's effective prices, for the item editor. Same
  // resolution the admin "new order" page does: override, else base price.
  const [{ data: productData }, { data: pricingData }, { data: cust }] =
    await Promise.all([
      admin
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name"),
      admin
        .from("customer_pricing")
        .select("product_id, custom_price")
        .eq("customer_id", order.customer_id),
      admin
        .from("customers")
        .select("waive_delivery_minimum, slice_fee")
        .eq("id", order.customer_id)
        .maybeSingle<{ waive_delivery_minimum: boolean; slice_fee: number }>(),
    ]);
  const overrides = new Map(
    (pricingData ?? []).map((p) => [p.product_id, Number(p.custom_price)]),
  );
  const pricedProducts: PricedProductOption[] = ((productData ?? []) as Product[]).map(
    (p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: overrides.has(p.id)
        ? (overrides.get(p.id) as number)
        : Number(p.base_price),
      hasOverride: overrides.has(p.id),
      allowHalf: p.allow_half_dozen,
      allowSlicing: p.allow_slicing,
    }),
  );

  // Seed the editor with what's currently on the order.
  const initialQty: Record<string, string> = {};
  const initialSliced: Record<string, boolean> = {};
  for (const i of items) {
    if (!i.product_id) continue; // product deleted since — can't re-price it
    initialQty[i.product_id] = String(Number(i.quantity));
    initialSliced[i.product_id] = Boolean(i.sliced);
  }

  // Warn when the order may already be in production. Admin is deliberately not
  // blocked (the record should be able to match what actually went out).
  const earliest = settings.orderCutoffEnabled
    ? earliestFulfillmentDate(new Date(), settings.orderCutoffHour)
    : null;
  const pastCutoff =
    !!earliest && !!order.delivery_date && order.delivery_date < earliest;
  const itemsWarning =
    order.status === "fulfilled"
      ? "This order is already marked fulfilled — editing changes the record of what went out, and its invoice."
      : order.status === "processing"
        ? "This order is already processing, so it may be in production. Check with the bakery before changing it."
        : pastCutoff
          ? `This order is past the ${formatCutoffHour(settings.orderCutoffHour)} cutoff for its delivery date, so it may already be in production.`
          : null;

  // Items dropped because their product no longer exists aren't editable; saving
  // would silently remove them, so say so rather than lose them quietly.
  const unpricableItems = items.filter((i) => !i.product_id).length;

  // The invoice auto-generated for this order (if any) — surfaces the admin
  // "generate it" path when one is somehow missing.
  const { data: invoice } = await admin
    .from("invoices")
    .select("*")
    .eq("order_id", id)
    .maybeSingle<Invoice>();

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to orders
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-stone-900">
            Order #{order.order_number}
            {order.standing_order_id ? <StandingOrderBadge /> : null}
          </h1>
          {order.status === "canceled" ? (
            <div className="flex items-center gap-3">
              <StatusBadge status={order.status} />
              <form action={reinstateOrder}>
                <input type="hidden" name="id" value={order.id} />
                <button
                  type="submit"
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                >
                  Reinstate
                </button>
              </form>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <OrderStatusForm id={order.id} status={order.status} />
              <CancelOrderButton
                id={order.id}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
              />
            </div>
          )}
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {order.customers?.business_name ?? "—"}
          {order.customers?.contact_name
            ? ` · ${order.customers.contact_name}`
            : ""}
          {order.customers?.email ? ` · ${order.customers.email}` : ""}
          {" · "}
          {formatDate(order.order_date)}
        </p>
      </div>

      <EditFulfillmentForm
        order={order}
        deliveryWindows={settings.deliveryWindows}
      />

      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900">Invoice</h2>
            {invoice ? (
              <p className="mt-1 text-sm text-stone-500">
                {invoice.invoice_number} · Due{" "}
                {formatDateOnly(invoice.due_date)}
              </p>
            ) : (
              <p className="mt-1 text-sm text-stone-500">
                No invoice exists for this order yet.
              </p>
            )}
          </div>
          {invoice ? (
            <div className="flex items-center gap-3">
              <InvoiceStatusBadge status={invoice.status} />
              <Link
                href={`/admin/invoices/${invoice.id}${fromParam(`/admin/orders/${order.id}`)}`}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                View invoice
              </Link>
            </div>
          ) : (
            <GenerateInvoiceButton orderId={order.id} />
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900">Items</h2>
            <p className="mt-1 text-sm text-stone-500">
              Change what&apos;s on this order — quantities, slicing, or adding
              and removing products. The invoice follows the new total.
            </p>
            {unpricableItems > 0 ? (
              <p className="mt-2 text-sm text-amber-700">
                {unpricableItems} line
                {unpricableItems === 1 ? "" : "s"} reference a product that no
                longer exists and can&apos;t be re-priced — saving an edit would
                drop {unpricableItems === 1 ? "it" : "them"}.
              </p>
            ) : null}
          </div>
          <EditOrderItemsForm
            orderId={order.id}
            products={pricedProducts}
            initialQty={initialQty}
            initialSliced={initialSliced}
            currentTotal={Number(order.total_amount)}
            deliveryFee={settings.deliveryFee}
            deliveryMinimum={settings.deliveryMinimum}
            sliceFee={Number(cust?.slice_fee ?? 0)}
            waiveDeliveryMinimum={Boolean(cust?.waive_delivery_minimum)}
            isDelivery={order.fulfillment_type === "delivery"}
            warning={itemsWarning}
          />
        </div>
      </section>

      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-6 py-3">Item</th>
              <th className="px-6 py-3 text-right">Qty</th>
              <th className="px-6 py-3 text-right">Unit price</th>
              <th className="px-6 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-stone-100 last:border-0">
                <td className="px-6 py-3 font-medium text-stone-900">
                  {i.product_name}
                  {i.sliced ? (
                    <span className="ml-2 text-xs font-normal text-stone-500">
                      · sliced
                    </span>
                  ) : null}
                </td>
                <td className="px-6 py-3 text-right text-stone-600">
                  {i.quantity}
                </td>
                <td className="px-6 py-3 text-right text-stone-600">
                  {formatPrice(i.unit_price)}
                </td>
                <td className="px-6 py-3 text-right font-medium text-stone-900">
                  {formatPrice(i.line_total)}
                </td>
              </tr>
            ))}
            {(order.slice_fee ?? 0) > 0 ? (
              <tr className="border-b border-stone-100 last:border-0">
                <td className="px-6 py-3 font-medium text-stone-900">
                  Slice fee
                </td>
                <td className="px-6 py-3" />
                <td className="px-6 py-3" />
                <td className="px-6 py-3 text-right font-medium text-stone-900">
                  {formatPrice(order.slice_fee)}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200">
              <td colSpan={3} className="px-6 py-2 text-right text-sm text-stone-500">
                Subtotal
              </td>
              <td className="px-6 py-2 text-right text-sm text-stone-900">
                {formatPrice(order.total_amount - order.delivery_fee)}
              </td>
            </tr>
            {order.delivery_fee > 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-sm text-stone-500">
                  Delivery fee
                </td>
                <td className="px-6 py-2 text-right text-sm text-stone-900">
                  {formatPrice(order.delivery_fee)}
                </td>
              </tr>
            ) : null}
            <tr className="border-t border-stone-200">
              <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-stone-700">
                Total
              </td>
              <td className="px-6 py-3 text-right text-lg font-bold text-stone-900">
                {formatPrice(order.total_amount)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
