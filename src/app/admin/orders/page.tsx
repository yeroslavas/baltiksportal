import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDate } from "@/lib/format";
import { OrderStatusForm } from "./order-status-form";
import type { Order } from "@/lib/types";

type OrderRow = Order & { customers: { business_name: string } | null };

export default async function AdminOrdersPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("orders")
    .select("*, customers(business_name)")
    .order("order_date", { ascending: false });
  const orders = (data ?? []) as OrderRow[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Orders
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Every customer order. Update status as it moves through fulfillment.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          All orders ({orders.length})
        </h2>
        {orders.length === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Ordered</th>
                  <th className="px-6 py-3">Fulfillment</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-6 py-3 font-medium text-stone-900">
                      #{o.order_number}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {o.customers?.business_name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {formatDate(o.order_date)}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {o.delivery_date ? formatDate(o.delivery_date) : "—"}
                      <span className="capitalize text-stone-400">
                        {" · "}
                        {o.fulfillment_type}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-stone-900">
                      {formatPrice(o.total_amount)}
                    </td>
                    <td className="px-6 py-3">
                      <OrderStatusForm id={o.id} status={o.status} />
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/admin/orders/${o.id}`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
