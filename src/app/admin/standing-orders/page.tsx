import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateOnly } from "@/lib/format";
import {
  businessToday,
  formatSchedule,
  nextOccurrence,
} from "@/lib/standing-orders";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { SortableHeader, type SortDir } from "@/components/sortable-header";
import { RunGeneratorButton } from "./run-generator-button";
import type { StandingOrder } from "@/lib/types";

type Row = StandingOrder & { customers: { business_name: string } | null };

// Only DB columns sort server-side; schedule/items/next-order are computed.
const SORTS: Record<string, string> = {
  customer: "customers(business_name)",
  status: "is_active",
};

export default async function StandingOrdersPage({
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
  const sort = sortParam && SORTS[sortParam] ? sortParam : "";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  const { data, count } = await admin
    .from("standing_orders")
    .select("*, customers(business_name)", { count: "exact" })
    .order(sort ? SORTS[sort] : "created_at", {
      ascending: sort ? dir === "asc" : false,
    })
    .range(from, to);
  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (rows.length === 0 && total > 0 && page > totalPages) {
    const q = sort ? `sort=${sort}&dir=${dir}&` : "";
    redirect(`/admin/standing-orders?${q}page=${totalPages}`);
  }

  const today = businessToday();

  // Item counts only for the standing orders shown on this page.
  const itemCount = new Map<string, number>();
  if (rows.length > 0) {
    const { data: itemRows } = await admin
      .from("standing_order_items")
      .select("standing_order_id")
      .in(
        "standing_order_id",
        rows.map((r) => r.id),
      );
    for (const r of itemRows ?? []) {
      itemCount.set(
        r.standing_order_id,
        (itemCount.get(r.standing_order_id) ?? 0) + 1,
      );
    }
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

      {total === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          No standing orders yet. Create one to set up a recurring delivery.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-400">
              <tr>
                <SortableHeader column="customer" label="Customer" sort={sort} dir={dir} basePath="/admin/standing-orders" defaultDir="asc" className="px-5 py-3 font-medium" />
                <th className="px-5 py-3 font-medium">Schedule</th>
                <th className="px-5 py-3 font-medium">Items</th>
                <th className="px-5 py-3 font-medium">Next order</th>
                <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/standing-orders" defaultDir="desc" className="px-5 py-3 font-medium" />
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

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/standing-orders"
        query={{ sort: sort || undefined, dir: sort ? dir : undefined }}
      />
    </div>
  );
}
