import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { StatusBadge } from "@/components/status-badge";
import { formatPrice, formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";

export default async function OrdersPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();

  // RLS limits this to the signed-in customer's own orders.
  const { data } = await supabase
    .from("orders")
    .select("*")
    .order("order_date", { ascending: false });
  const orders = (data ?? []) as Order[];

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

        {orders.length === 0 ? (
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
          <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {orders.map((o) => (
              <li key={o.id}>
                <Link
                  href={`/orders/${o.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
                >
                  <div>
                    <p className="font-semibold text-stone-900">
                      Order #{o.order_number}
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
        )}
      </main>
    </div>
  );
}
