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

// Sortable columns. customer/status are stored; items/next are computed in app.
const SORT_KEYS = new Set(["customer", "items", "next", "status"]);

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
  const sort = sortParam && SORT_KEYS.has(sortParam) ? sortParam : "";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";

  const admin = createAdminClient();
  const today = businessToday();

  // Small table: fetch all, then enrich + sort + paginate in app, so the
  // computed "next order" date and item count are sortable too (not just
  // stored columns).
  const [{ data: soData }, { data: itemRows }] = await Promise.all([
    admin
      .from("standing_orders")
      .select("*, customers(business_name)")
      .order("created_at", { ascending: false }),
    admin.from("standing_order_items").select("standing_order_id"),
  ]);
  const itemCount = new Map<string, number>();
  for (const r of itemRows ?? []) {
    itemCount.set(
      r.standing_order_id,
      (itemCount.get(r.standing_order_id) ?? 0) + 1,
    );
  }

  type Enriched = { row: Row; items: number; next: string | null };
  const all: Enriched[] = ((soData ?? []) as Row[]).map((row) => ({
    row,
    items: itemCount.get(row.id) ?? 0,
    next: row.is_active ? nextOccurrence(row, today) : null,
  }));

  // Default order (no sort) is created_at desc, already applied by the query.
  if (sort) {
    const mul = dir === "asc" ? 1 : -1;
    all.sort((a, b) => {
      if (sort === "customer") {
        return (
          mul *
          (a.row.customers?.business_name ?? "").localeCompare(
            b.row.customers?.business_name ?? "",
          )
        );
      }
      if (sort === "items") return mul * (a.items - b.items);
      if (sort === "status") {
        return mul * (Number(a.row.is_active) - Number(b.row.is_active));
      }
      // next: a date string; paused / no-next rows always sort last.
      if (!a.next && !b.next) return 0;
      if (!a.next) return 1;
      if (!b.next) return -1;
      return mul * a.next.localeCompare(b.next);
    });
  }

  const total = all.length;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));
  if (total > 0 && page > totalPages) {
    const q = sort ? `sort=${sort}&dir=${dir}&` : "";
    redirect(`/admin/standing-orders?${q}page=${totalPages}`);
  }
  const fromIdx = (page - 1) * DEFAULT_PAGE_SIZE;
  const pageRows = all.slice(fromIdx, fromIdx + DEFAULT_PAGE_SIZE);

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
                <SortableHeader column="items" label="Items" sort={sort} dir={dir} basePath="/admin/standing-orders" defaultDir="desc" className="px-5 py-3 font-medium" />
                <SortableHeader column="next" label="Next order" sort={sort} dir={dir} basePath="/admin/standing-orders" defaultDir="asc" className="px-5 py-3 font-medium" />
                <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/standing-orders" defaultDir="desc" className="px-5 py-3 font-medium" />
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {pageRows.map(({ row: r, items, next }) => (
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
                  <td className="px-5 py-3 text-stone-600">{items}</td>
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
              ))}
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
