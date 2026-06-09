import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDate } from "@/lib/format";
import { OrderStatusForm } from "../order-status-form";
import { FulfillmentInfo } from "@/components/fulfillment-info";
import type { Order, OrderItem } from "@/lib/types";

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
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Order #{order.order_number}
          </h1>
          <OrderStatusForm id={order.id} status={order.status} />
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

      <FulfillmentInfo order={order} />

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
