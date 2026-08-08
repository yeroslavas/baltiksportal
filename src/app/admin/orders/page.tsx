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
  searchParams: Promise<{
    page?: string;
    sort?: string;
    dir?: string;
    q?: string;
  }>;
}) {
  const {
    page: pageParam,
    sort: sortParam,
    dir: dirParam,
    q: qParam,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const sort = sortParam && SORTS[sortParam] ? sortParam : "order";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  const q = (qParam ?? "").trim().slice(0, 80);
  // Sanitize for a PostgREST or() filter — strip chars that break its grammar.
  const safeQ = q.replace(/[,()*%\\]/g, "");
  // A "#123"/"123" query can match an order number; strip non-digits for that.
  const digits = q.replace(/\D/g, "");

  // Build a URL preserving sort + search, with overrides (undefined drops a key,
  // and page is never carried unless overridden, so a new search resets to p.1).
  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const merged: Record<string, string | undefined> = {
      sort: sort !== "order" ? sort : undefined,
      dir: dir !== "desc" ? dir : undefined,
      q: q || undefined,
      ...overrides,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/orders?${s}` : "/admin/orders";
  };
  const listParams: Record<string, string | undefined> = { q: q || undefined };

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;
  let query = admin
    .from("orders")
    .select("*, customers(business_name)", { count: "exact" })
    .order(SORTS[sort], { ascending: dir === "asc" });
  if (safeQ) {
    // Customer name lives on the embedded relation, so resolve name matches to
    // customer ids first, then filter orders on parent columns only (reliable
    // in a single or()): by matched customer OR by exact order number.
    const { data: custMatches } = await admin
      .from("customers")
      .select("id")
      .ilike("business_name", `%${safeQ}%`);
    const custIds = (custMatches ?? []).map((c) => c.id);
    const orParts: string[] = [];
    if (custIds.length > 0) orParts.push(`customer_id.in.(${custIds.join(",")})`);
    if (digits) orParts.push(`order_number.eq.${digits}`);
    // No possible match (unknown name, no number) — force an empty result set.
    query = query.or(orParts.length ? orParts.join(",") : "order_number.eq.-1");
  }
  const { data, count } = await query.range(from, to);
  const orders = (data ?? []) as OrderRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  // A manually-entered out-of-range page jumps to the last valid page
  // (keeping the active sort + search).
  if (orders.length === 0 && total > 0 && page > totalPages) {
    redirect(buildHref({ page: String(totalPages) }));
  }

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Orders
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Every customer order. Update status as it moves through fulfillment.
          </p>
        </div>
        <Link
          href="/admin/orders/new"
          className="shrink-0 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Create order
        </Link>
      </div>

      <form
        method="get"
        action="/admin/orders"
        className="flex flex-wrap items-center gap-2"
      >
        {sort !== "order" ? (
          <input type="hidden" name="sort" value={sort} />
        ) : null}
        {dir !== "desc" ? <input type="hidden" name="dir" value={dir} /> : null}
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by customer or order #…"
          className="w-full max-w-xs rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Search
        </button>
        {q ? (
          <a
            href={buildHref({ q: undefined })}
            className="text-sm font-medium text-stone-500 transition hover:text-stone-700 hover:underline"
          >
            Clear
          </a>
        ) : null}
      </form>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          {q ? "Matching orders" : "All orders"} ({total})
          {q ? (
            <span className="font-normal text-stone-500"> · “{q}”</span>
          ) : null}
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">
            {q ? "No orders match your search." : "No orders yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <SortableHeader column="order" label="Order" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" extraParams={listParams} />
                  <SortableHeader column="customer" label="Customer" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="asc" extraParams={listParams} />
                  <SortableHeader column="ordered" label="Ordered" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" extraParams={listParams} />
                  <SortableHeader column="fulfillment" label="Fulfillment" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" extraParams={listParams} />
                  <SortableHeader column="total" label="Total" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="desc" extraParams={listParams} />
                  <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/orders" defaultDir="asc" extraParams={listParams} />
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
        query={{ sort, dir, ...listParams }}
      />
    </div>
  );
}
