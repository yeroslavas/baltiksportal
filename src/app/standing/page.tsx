import { requireUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { CustomerHeader } from "@/components/customer-header";
import { formatDateOnly } from "@/lib/format";
import {
  businessToday,
  formatSchedule,
  scheduledDates,
} from "@/lib/standing-orders";
import type { StandingOrder } from "@/lib/types";
import {
  customerSkipDate,
  customerUnskipDate,
  customerSetPaused,
} from "./actions";

type ItemRow = {
  standing_order_id: string;
  quantity: number;
  products: { name: string } | null;
};

export default async function CustomerStandingOrdersPage() {
  const user = await requireUser();
  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; business_name: string }>();
  const label = customer?.business_name ?? user.email ?? "";

  const { data: soData } = customer
    ? await admin
        .from("standing_orders")
        .select("*")
        .eq("customer_id", customer.id)
        .order("created_at")
    : { data: [] };
  const sos = (soData ?? []) as StandingOrder[];

  const soIds = sos.map((s) => s.id);
  const { data: itemData } = soIds.length
    ? await admin
        .from("standing_order_items")
        .select("standing_order_id, quantity, products(name)")
        .in("standing_order_id", soIds)
    : { data: [] };
  const itemsBySo = new Map<string, { name: string; quantity: number }[]>();
  for (const it of (itemData ?? []) as unknown as ItemRow[]) {
    const arr = itemsBySo.get(it.standing_order_id) ?? [];
    arr.push({ name: it.products?.name ?? "Item", quantity: it.quantity });
    itemsBySo.set(it.standing_order_id, arr);
  }

  const today = businessToday();

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader label={label} isAdminUser={isAdmin(user.email)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Your standing order
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Recurring orders we prepare for you automatically. Skip a date or pause
          anytime — changes apply to orders not yet out for fulfillment.
        </p>

        {sos.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
            You don’t have a standing order set up. Contact Baltik’s to arrange
            recurring deliveries.
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {sos.map((so) => {
              const items = itemsBySo.get(so.id) ?? [];
              const upcoming = scheduledDates(so, today, 6);
              return (
                <section
                  key={so.id}
                  className="overflow-hidden rounded-2xl border border-stone-200 bg-white"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 px-5 py-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {formatSchedule(so)}
                      </p>
                      <p className="text-xs capitalize text-stone-500">
                        {so.fulfillment_type}
                        {so.is_active ? "" : " · paused"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {so.is_active ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                          Paused
                        </span>
                      )}
                      <form action={customerSetPaused}>
                        <input type="hidden" name="standing_order_id" value={so.id} />
                        <input
                          type="hidden"
                          name="paused"
                          value={so.is_active ? "true" : "false"}
                        />
                        <button
                          type="submit"
                          className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
                        >
                          {so.is_active ? "Pause" : "Resume"}
                        </button>
                      </form>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-px bg-stone-100 sm:grid-cols-2">
                    {/* Items */}
                    <div className="bg-white px-5 py-4">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Items
                      </h2>
                      <ul className="mt-2 space-y-1 text-sm text-stone-700">
                        {items.length === 0 ? (
                          <li className="text-stone-400">No items.</li>
                        ) : (
                          items.map((it, i) => (
                            <li key={i}>
                              <span className="font-medium text-stone-900">
                                {it.quantity}
                              </span>{" "}
                              × {it.name}
                            </li>
                          ))
                        )}
                      </ul>
                    </div>

                    {/* Upcoming dates */}
                    <div className="bg-white px-5 py-4">
                      <h2 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Upcoming dates
                      </h2>
                      {upcoming.length === 0 ? (
                        <p className="mt-2 text-sm text-stone-400">
                          No upcoming dates.
                        </p>
                      ) : (
                        <ul className="mt-2 space-y-1.5">
                          {upcoming.map((date) => {
                            const skipped = so.skip_dates.includes(date);
                            return (
                              <li
                                key={date}
                                className="flex items-center justify-between gap-3 text-sm"
                              >
                                <span
                                  className={
                                    skipped
                                      ? "text-stone-400 line-through"
                                      : "text-stone-700"
                                  }
                                >
                                  {formatDateOnly(date)}
                                </span>
                                {skipped ? (
                                  <form action={customerUnskipDate}>
                                    <input type="hidden" name="standing_order_id" value={so.id} />
                                    <input type="hidden" name="date" value={date} />
                                    <button
                                      type="submit"
                                      className="text-xs font-medium text-brand-700 hover:underline"
                                    >
                                      Undo skip
                                    </button>
                                  </form>
                                ) : (
                                  <form action={customerSkipDate}>
                                    <input type="hidden" name="standing_order_id" value={so.id} />
                                    <input type="hidden" name="date" value={date} />
                                    <button
                                      type="submit"
                                      className="text-xs font-medium text-stone-500 transition hover:text-red-600 hover:underline"
                                    >
                                      Skip
                                    </button>
                                  </form>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
