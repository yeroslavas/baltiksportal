import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDate } from "@/lib/format";
import { OrderStatusForm } from "./order-status-form";
import { CancelOrderButton } from "./cancel-order-button";
import { reinstateOrder } from "./actions";
import { StatusBadge } from "@/components/status-badge";
import { StandingOrderBadge } from "@/components/standing-order-badge";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { SortableHeader, type SortDir } from "@/components/sortable-header";
import type { Order } from "@/lib/types";

type OrderRow = Order & { customers: { business_name: string } | null };

// Sort key (from the URL) → the DB column/expression to order by. "customer"
// orders the parent by the embedded customers.business_name.
const SORTS: Record<string, string> = {
  order: "order_number",
  customer: "customers(business_name)",
  ordered: "order_date",
  fulfillment: "delivery_date",
  total: "total_amount",
  status: "status",
};

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; dir?: string }>;
}) {
  const {
    page: pageParam,
    sort: sortParam,
    dir: dirParam,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const sort = sortParam && SORTS[sortParam] ? sortParam : "order";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  const { data, count } = await admin
    .from("orders")
    .select("*, customers(business_name)", { count: "exact" })
    .order(SORTS[sort], { ascending: dir === "asc" })
    .range(from, to);
  const orders = (data ?? []) as OrderRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // A manually-entered out-of-range page jumps to the last valid page
  // (keeping the active sort).
  if (orders.length === 0 && total > 0 && page > totalPages) {
    redirect(`/admin/orders?sort=${sort}&dir=${dir}&page=${totalPages}`);
  }

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
          All orders ({total})
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">No orders yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <SortableHeader column="order" label="Order" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" />
                  <SortableHeader column="customer" label="Customer" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="asc" />
                  <SortableHeader column="ordered" label="Ordered" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" />
                  <SortableHeader column="fulfillment" label="Fulfillment" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" />
                  <SortableHeader column="total" label="Total" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" />
                  <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="asc" />
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
                      <span className="flex items-center gap-2">
                        #{o.order_number}
                        {o.standing_order_id ? <StandingOrderBadge /> : null}
                      </span>
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
                      {o.status === "canceled" ? (
                        <StatusBadge status={o.status} />
                      ) : (
                        <OrderStatusForm id={o.id} status={o.status} />
                      )}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center justify-end gap-3">
                        {o.status === "canceled" ? (
                          <form action={reinstateOrder}>
                            <input type="hidden" name="id" value={o.id} />
                            <button
                              type="submit"
                              className="text-sm font-medium text-brand-700 hover:underline"
                            >
                              Reinstate
                            </button>
                          </form>
                        ) : (
                          <CancelOrderButton id={o.id} />
                        )}
                        <Link
                          href={`/admin/orders/${o.id}`}
                          className="font-medium text-brand-700 hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/orders"
        query={{ sort, dir }}
      />
    </div>
  );
}
