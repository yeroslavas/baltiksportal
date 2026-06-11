import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { SortableHeader, type SortDir } from "@/components/sortable-header";
import { businessToday } from "@/lib/standing-orders";
import { InvoiceStatusForm } from "./invoice-status-form";
import { RecomputeOverdueButton } from "./recompute-overdue-button";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import type { Invoice } from "@/lib/types";

type InvoiceRow = Invoice & {
  customers: { business_name: string } | null;
  orders: { order_number: number; delivery_date: string | null } | null;
};

type InvoiceSummary = {
  outstanding_total: number;
  unpaid_count: number;
  overdue_count: number;
};

const SORTS: Record<string, string> = {
  invoice: "invoice_number",
  customer: "customers(business_name)",
  order: "orders(order_number)",
  issued: "issue_date",
  delivery: "orders(delivery_date)",
  due: "due_date",
  total: "total_amount",
  status: "status",
};

export default async function AdminInvoicesPage({
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
  const sort = sortParam && SORTS[sortParam] ? sortParam : "issued";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  // The list is paginated; the summary cards aggregate ALL invoices via a
  // server-side function, so they stay accurate regardless of the page (and
  // never hit the REST row cap).
  let invQuery = admin
    .from("invoices")
    .select("*, customers(business_name), orders(order_number, delivery_date)", {
      count: "exact",
    })
    .order(SORTS[sort], { ascending: dir === "asc" });
  if (sort !== "invoice") {
    invQuery = invQuery.order("invoice_number", { ascending: false }); // stable tiebreak
  }
  const [{ data, count }, { data: summaryRows }] = await Promise.all([
    invQuery.range(from, to),
    admin.rpc("invoice_summary"),
  ]);
  const invoices = (data ?? []) as InvoiceRow[];
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (invoices.length === 0 && total > 0 && page > totalPages) {
    redirect(`/admin/invoices?sort=${sort}&dir=${dir}&page=${totalPages}`);
  }

  const today = businessToday();

  const agg = (summaryRows as InvoiceSummary[] | null)?.[0];
  const summary = [
    {
      label: "Outstanding balance",
      value: formatPrice(Number(agg?.outstanding_total ?? 0)),
    },
    { label: "Unpaid", value: Number(agg?.unpaid_count ?? 0) },
    { label: "Overdue", value: Number(agg?.overdue_count ?? 0) },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Invoices
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Every invoice across all customers. Mark them paid as payment arrives.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {summary.map((s) => (
          <div
            key={s.label}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-stone-500">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-stone-900">{s.value}</p>
          </div>
        ))}
      </div>

      <form
        action="/admin/invoices/day-pdf"
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="day-pdf-date"
            className="text-sm font-medium text-stone-700"
          >
            Delivery prep — download a day&apos;s invoices
          </label>
          <input
            id="day-pdf-date"
            type="date"
            name="date"
            defaultValue={today}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          />
        </div>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Download invoices
        </button>
        <p className="max-w-sm text-xs text-stone-500">
          One PDF, one invoice per page — every non-canceled order fulfilled that
          day, ordered by delivery window. Defaults to today.
        </p>
      </form>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          Overdue status is recalculated on demand — run it to flag unpaid
          invoices past their due date.
        </p>
        <RecomputeOverdueButton />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          All invoices ({total})
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">
            No invoices yet. They&apos;re created automatically when an order is
            placed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <SortableHeader column="invoice" label="Invoice" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" />
                  <SortableHeader column="customer" label="Customer" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" />
                  <SortableHeader column="order" label="Order" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" />
                  <SortableHeader column="issued" label="Issued" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" />
                  <SortableHeader column="delivery" label="Delivery" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" />
                  <SortableHeader column="due" label="Due" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" />
                  <SortableHeader column="total" label="Total" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" />
                  <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" />
                  <th className="px-6 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-stone-100 last:border-0"
                  >
                    <td className="px-6 py-3 font-medium text-stone-900">
                      {inv.invoice_number}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {inv.customers?.business_name ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {inv.orders?.order_number ? `#${inv.orders.order_number}` : "—"}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {formatDateOnly(inv.issue_date)}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {inv.orders?.delivery_date
                        ? formatDateOnly(inv.orders.delivery_date)
                        : "—"}
                    </td>
                    <td className="px-6 py-3 text-stone-600">
                      {formatDateOnly(inv.due_date)}
                    </td>
                    <td className="px-6 py-3 text-stone-900">
                      {formatPrice(inv.total_amount)}
                    </td>
                    <td className="px-6 py-3">
                      {inv.status === "canceled" ? (
                        <InvoiceStatusBadge status={inv.status} />
                      ) : (
                        <InvoiceStatusForm id={inv.id} status={inv.status} />
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <Link
                        href={`/admin/invoices/${inv.id}`}
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

      <Pagination
        page={page}
        totalPages={totalPages}
        basePath="/admin/invoices"
        query={{ sort, dir }}
      />
    </div>
  );
}
