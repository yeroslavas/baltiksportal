import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { StatusBadge } from "@/components/status-badge";
import { StandingOrderBadge } from "@/components/standing-order-badge";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { formatPrice, formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);

  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();

  // RLS limits this to the signed-in customer's own orders. count: "exact"
  // returns the full total (ignoring the range) so we can page accurately.
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  const { data, count } = await supabase
    .from("orders")
    .select("*", { count: "exact" })
    .order("order_date", { ascending: false })
    .range(from, to);
  const orders = (data ?? []) as Order[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // A manually-entered out-of-range page jumps to the last valid page.
  if (orders.length === 0 && total > 0 && page > totalPages) {
    redirect(`/orders?page=${totalPages}`);
  }

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Order history
        </h1>

        {total === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
            No orders yet.{" "}
            <Link
              href="/catalog"
              className="font-medium text-brand-700 hover:underline"
            >
              Start an order
            </Link>
            .
          </div>
        ) : (
          <>
            <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
                >
                  <div>
                    <p className="flex items-center gap-2 font-semibold text-stone-900">
                      Order #{o.order_number}
                      {o.standing_order_id ? <StandingOrderBadge /> : null}
                    </p>
                    <p className="text-xs text-stone-500">
                      Ordered {formatDate(o.order_date)}
                      {o.delivery_date
                        ? ` · ${o.fulfillment_type === "pickup" ? "Pickup" : "Delivery"} ${formatDate(o.delivery_date)}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <StatusBadge status={o.status} />
                    <span className="w-20 text-right font-semibold text-stone-900">
                      {formatPrice(o.total_amount)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
            </ul>
            <Pagination page={page} totalPages={totalPages} basePath="/orders" />
          </>
        )}
      </main>
    </div>
  );
}
