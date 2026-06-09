import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { StatusBadge } from "@/components/status-badge";
import { FulfillmentInfo } from "@/components/fulfillment-info";
import { formatPrice, formatDate } from "@/lib/format";
import type { Order, OrderItem } from "@/lib/types";

export default async function OrderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { id } = await params;
  const { placed } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();
  const label = customer?.business_name ?? user.email ?? "";

  // RLS: only the customer's own order resolves; anything else returns null.
  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle<Order>();

  if (!order) {
    return (
      <div className="flex flex-1 flex-col">
        <CustomerHeader label={label} isAdminUser={isAdmin(user.email)} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <h1 className="text-2xl font-bold text-stone-900">Order not found</h1>
          <Link
            href="/orders"
            className="mt-4 inline-block font-medium text-brand-700 hover:underline"
          >
            ← Back to orders
          </Link>
        </main>
      </div>
    );
  }

  const { data: itemsData } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id);
  const items = (itemsData ?? []) as OrderItem[];

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader label={label} isAdminUser={isAdmin(user.email)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link
          href="/orders"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to orders
        </Link>

        {placed ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
            <p className="font-semibold">Order placed — thank you!</p>
            <p>
              Your order number is #{order.order_number}. We&apos;ll get it
              ready.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Order #{order.order_number}
          </h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {formatDate(order.order_date)}
        </p>

        <div className="mt-4">
          <FulfillmentInfo order={order} />
        </div>

        <section className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit price</th>
                <th className="px-5 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-5 py-3 font-medium text-stone-900">
                    {i.product_name}
                  </td>
                  <td className="px-5 py-3 text-right text-stone-600">
                    {i.quantity}
                  </td>
                  <td className="px-5 py-3 text-right text-stone-600">
                    {formatPrice(i.unit_price)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-stone-900">
                    {formatPrice(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200">
                <td colSpan={3} className="px-5 py-2 text-right text-sm text-stone-500">
                  Subtotal
                </td>
                <td className="px-5 py-2 text-right text-sm text-stone-900">
                  {formatPrice(order.total_amount - order.delivery_fee)}
                </td>
              </tr>
              {order.delivery_fee > 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-sm text-stone-500">
                    Delivery fee
                  </td>
                  <td className="px-5 py-2 text-right text-sm text-stone-900">
                    {formatPrice(order.delivery_fee)}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t border-stone-200">
                <td colSpan={3} className="px-5 py-3 text-right text-sm font-medium text-stone-700">
                  Total
                </td>
                <td className="px-5 py-3 text-right text-lg font-bold text-stone-900">
                  {formatPrice(order.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </main>
    </div>
  );
}
