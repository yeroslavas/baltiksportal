import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateOnly } from "@/lib/format";
import {
  businessToday,
  formatSchedule,
  nextOccurrence,
} from "@/lib/standing-orders";
import { RunGeneratorButton } from "./run-generator-button";
import type { StandingOrder } from "@/lib/types";

type Row = StandingOrder & { customers: { business_name: string } | null };

export default async function StandingOrdersPage() {
  const admin = createAdminClient();
  const [{ data }, { data: itemRows }] = await Promise.all([
    admin
      .from("standing_orders")
      .select("*, customers(business_name)")
      .order("created_at", { ascending: false }),
    admin.from("standing_order_items").select("standing_order_id"),
  ]);
  const rows = (data ?? []) as Row[];
  const today = businessToday();

  const itemCount = new Map<string, number>();
  for (const r of itemRows ?? []) {
    itemCount.set(
      r.standing_order_id,
      (itemCount.get(r.standing_order_id) ?? 0) + 1,
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Standing orders
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Recurring orders generated automatically a few days before each
            delivery date.
          </p>
        </div>
        <Link
          href="/admin/standing-orders/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          New standing order
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <RunGeneratorButton />
        <p className="text-xs text-stone-500">
          Creates orders due within their lead window now, instead of waiting for
          the nightly run. Safe to run repeatedly — it won’t duplicate.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          No standing orders yet. Create one to set up a recurring delivery.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <th className="px-5 py-3 font-medium">Customer</th>
                <th className="px-5 py-3 font-medium">Schedule</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Next order</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map((r) => {
                const next = r.is_active ? nextOccurrence(r, today) : null;
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3 font-medium text-stone-900">
                      {r.customers?.business_name ?? "—"}
                      <span className="block text-xs font-normal capitalize text-stone-400">
                        {r.fulfillment_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {formatSchedule(r)}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {itemCount.get(r.id) ?? 0}
                    </td>
                    <td className="px-5 py-3 text-stone-600">
                      {next ? formatDateOnly(next) : "—"}
                    </td>
                    <td className="px-5 py-3">
                      {r.is_active ? (
                        <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/standing-orders/${r.id}/edit`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
