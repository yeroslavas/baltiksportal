import Link from "next/link";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { Pagination, DEFAULT_PAGE_SIZE } from "@/components/pagination";
import { SortableHeader, type SortDir } from "@/components/sortable-header";
import { businessToday } from "@/lib/standing-orders";
import { RecomputeOverdueButton } from "./recompute-overdue-button";
import { ReconcileButton } from "./reconcile-button";
import { RunAutopayButton } from "./run-autopay-button";
import { InvoiceDisplayBadge } from "@/components/invoice-display-badge";
import { CreditOverrideBadge } from "@/components/credit-override-badge";
import type { Invoice } from "@/lib/types";

type EnrolledCustomer = {
  id: string;
  business_name: string;
  autopay_bank_last4: string | null;
  autopay_fail_count: number;
};

type InvoiceRow = Invoice & {
  customers: {
    business_name: string;
    credit_hold_override_until: string | null;
    credit_hold_override_reason: string | null;
  } | null;
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

// Status filter tabs. "all" = no filter; the rest match the display badges
// (outstanding = everything still owed). The query for each is applied below and
// must stay in sync with invoiceDisplayState() in invoice-display-badge.tsx.
const FILTER_TABS = [
  { key: "all", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "processing", label: "Processing" },
  { key: "declined", label: "Declined" },
  { key: "incomplete", label: "Incomplete" },
  { key: "paid", label: "Paid" },
] as const;
const FILTER_KEYS: string[] = FILTER_TABS.map((t) => t.key);

export default async function AdminInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    sort?: string;
    dir?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const {
    page: pageParam,
    sort: sortParam,
    dir: dirParam,
    status: statusParam,
    q: qParam,
  } = await searchParams;
  const page = Math.max(1, Math.floor(Number(pageParam)) || 1);
  const sort = sortParam && SORTS[sortParam] ? sortParam : "issued";
  const dir: SortDir = dirParam === "asc" ? "asc" : "desc";
  const status = statusParam && FILTER_KEYS.includes(statusParam) ? statusParam : "all";
  const q = (qParam ?? "").trim().slice(0, 100);

  // Build a URL preserving the current view (filter/sort/search), with overrides.
  // Passing a key as undefined drops it. Never carries `page` unless overridden,
  // so changing filter/sort/search resets to page 1.
  const buildHref = (overrides: Record<string, string | undefined> = {}) => {
    const merged: Record<string, string | undefined> = {
      status: status !== "all" ? status : undefined,
      sort: sort !== "issued" ? sort : undefined,
      dir: dir !== "desc" ? dir : undefined,
      q: q || undefined,
      ...overrides,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin/invoices?${s}` : "/admin/invoices";
  };

  // Preserved on sort-header and pagination links so they don't drop the active
  // filter/search. (Sort headers add sort/dir themselves; pagination gets them
  // via `query` below.)
  const listFilterParams: Record<string, string | undefined> = {
    status: status !== "all" ? status : undefined,
    q: q || undefined,
  };

  const admin = createAdminClient();
  const from = (page - 1) * DEFAULT_PAGE_SIZE;
  const to = from + DEFAULT_PAGE_SIZE - 1;

  // Paginated rows for the ACTIVE filter + customer search. The stored status
  // column only knows unpaid/paid/overdue/canceled, so the derived
  // "processing"/"declined" filters are expressed with the same signals the badge
  // uses (in-flight tag; the "⚠ … failed" note marker — validated against live
  // data). NOTE: PostgREST .or() uses * as its wildcard, .ilike() uses %.
  let dataQuery = admin
    .from("invoices")
    .select(
      "*, customers!inner(business_name, credit_hold_override_until, credit_hold_override_reason), orders(order_number, delivery_date)",
    )
    .order(SORTS[sort], { ascending: dir === "asc" });
  if (sort !== "invoice") {
    dataQuery = dataQuery.order("invoice_number", { ascending: false }); // stable tiebreak
  }
  if (q) dataQuery = dataQuery.ilike("customers.business_name", `%${q}%`);
  switch (status) {
    case "outstanding":
      dataQuery = dataQuery.in("status", ["unpaid", "overdue"]);
      break;
    case "overdue":
      dataQuery = dataQuery
        .eq("status", "overdue")
        .is("stripe_payment_id", null)
        .or(
          "payment_note.is.null,and(payment_note.not.ilike.⚠*,payment_note.not.ilike.⏳*)",
        );
      break;
    case "processing":
      dataQuery = dataQuery
        .in("status", ["unpaid", "overdue"])
        .not("stripe_payment_id", "is", null);
      break;
    case "declined":
      dataQuery = dataQuery
        .in("status", ["unpaid", "overdue"])
        .is("stripe_payment_id", null)
        .ilike("payment_note", "⚠%");
      break;
    case "incomplete":
      dataQuery = dataQuery
        .in("status", ["unpaid", "overdue"])
        .is("stripe_payment_id", null)
        .ilike("payment_note", "⏳%");
      break;
    case "paid":
      dataQuery = dataQuery.eq("status", "paid");
      break;
  }

  // Count for each tab (respecting the search) — the tab labels + pagination total.
  // Same filter logic as above; kept in sync deliberately (the two builders have
  // different Row types, so a shared helper isn't worth the generics).
  const countFor = async (key: string): Promise<number> => {
    let cq = admin
      .from("invoices")
      .select("id, customers!inner(business_name)", { count: "exact", head: true });
    if (q) cq = cq.ilike("customers.business_name", `%${q}%`);
    switch (key) {
      case "outstanding":
        cq = cq.in("status", ["unpaid", "overdue"]);
        break;
      case "overdue":
        cq = cq
          .eq("status", "overdue")
          .is("stripe_payment_id", null)
          .or(
            "payment_note.is.null,and(payment_note.not.ilike.⚠*,payment_note.not.ilike.⏳*)",
          );
        break;
      case "processing":
        cq = cq
          .in("status", ["unpaid", "overdue"])
          .not("stripe_payment_id", "is", null);
        break;
      case "declined":
        cq = cq
          .in("status", ["unpaid", "overdue"])
          .is("stripe_payment_id", null)
          .ilike("payment_note", "⚠%");
        break;
      case "incomplete":
        cq = cq
          .in("status", ["unpaid", "overdue"])
          .is("stripe_payment_id", null)
          .ilike("payment_note", "⏳%");
        break;
      case "paid":
        cq = cq.eq("status", "paid");
        break;
    }
    const { count } = await cq;
    return count ?? 0;
  };

  const [{ data }, countEntries, { data: summaryRows }, { data: enrolledRows }] =
    await Promise.all([
      dataQuery.range(from, to),
      Promise.all(
        FILTER_TABS.map(async (t) => [t.key, await countFor(t.key)] as const),
      ),
      admin.rpc("invoice_summary"),
      admin
        .from("customers")
        .select("id, business_name, autopay_bank_last4, autopay_fail_count")
        .eq("autopay_enabled", true)
        .order("business_name"),
    ]);
  const counts = Object.fromEntries(countEntries) as Record<string, number>;
  const enrolled = (enrolledRows ?? []) as EnrolledCustomer[];
  const invoices = (data ?? []) as InvoiceRow[];
  const total = counts[status] ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / DEFAULT_PAGE_SIZE));

  if (invoices.length === 0 && total > 0 && page > totalPages) {
    redirect(buildHref({ page: String(totalPages) }));
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

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold text-stone-900">Auto-pay</h2>
            <p className="mt-0.5 max-w-xl text-sm text-stone-500">
              {enrolled.length} customer{enrolled.length === 1 ? "" : "s"}{" "}
              enrolled — due invoices charge automatically each day. Run now to
              charge any due invoices immediately.
            </p>
          </div>
          <RunAutopayButton />
        </div>
        {enrolled.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {enrolled.map((c) => (
              <li
                key={c.id}
                className="rounded-full border border-stone-200 bg-stone-50 px-3 py-1 text-xs text-stone-600"
              >
                {c.business_name}
                {c.autopay_bank_last4 ? ` ••${c.autopay_bank_last4}` : ""}
                {c.autopay_fail_count > 0 ? (
                  <span className="ml-1 font-medium text-amber-700">
                    ⚠ {c.autopay_fail_count}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-stone-500">
          Reconcile payments checks every invoice showing{" "}
          <span className="font-medium text-blue-700">Payment Processing</span>{" "}
          against Stripe — settling any that cleared and clearing any that were
          declined or returned (which re-locks the account). Runs automatically,
          but you can force it here.
        </p>
        <ReconcileButton />
      </div>

      <div className="space-y-4">
        <form
          method="get"
          action="/admin/invoices"
          className="flex flex-wrap items-center gap-2"
        >
          {status !== "all" ? (
            <input type="hidden" name="status" value={status} />
          ) : null}
          {sort !== "issued" ? (
            <input type="hidden" name="sort" value={sort} />
          ) : null}
          {dir !== "desc" ? <input type="hidden" name="dir" value={dir} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by customer…"
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

        <div className="flex flex-wrap gap-2">
          {FILTER_TABS.map((t) => {
            const activeTab = status === t.key;
            return (
              <Link
                key={t.key}
                href={buildHref({ status: t.key === "all" ? undefined : t.key })}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                  activeTab
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-stone-300 bg-white text-stone-600 hover:bg-stone-100"
                }`}
              >
                {t.label}
                <span
                  className={`rounded-full px-1.5 text-xs ${
                    activeTab ? "bg-white/25" : "bg-stone-100 text-stone-500"
                  }`}
                >
                  {counts[t.key] ?? 0}
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          {FILTER_TABS.find((t) => t.key === status)?.label ?? "All"} invoices (
          {total})
          {q ? (
            <span className="font-normal text-stone-500"> · matching “{q}”</span>
          ) : null}
        </h2>
        {total === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">
            {q || status !== "all"
              ? "No invoices match this filter."
              : "No invoices yet. They're created automatically when an order is placed."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <SortableHeader column="invoice" label="Invoice" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" extraParams={listFilterParams} />
                  <SortableHeader column="customer" label="Customer" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" extraParams={listFilterParams} />
                  <SortableHeader column="order" label="Order" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" extraParams={listFilterParams} />
                  <SortableHeader column="issued" label="Issued" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" extraParams={listFilterParams} />
                  <SortableHeader column="delivery" label="Delivery" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" extraParams={listFilterParams} />
                  <SortableHeader column="due" label="Due" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" extraParams={listFilterParams} />
                  <SortableHeader column="total" label="Total" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="desc" extraParams={listFilterParams} />
                  <SortableHeader column="status" label="Status" sort={sort} dir={dir} basePath="/admin/invoices" defaultDir="asc" extraParams={listFilterParams} />
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
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{inv.customers?.business_name ?? "—"}</span>
                        {inv.status === "unpaid" || inv.status === "overdue" ? (
                          <CreditOverrideBadge
                            until={inv.customers?.credit_hold_override_until ?? null}
                            reason={inv.customers?.credit_hold_override_reason ?? null}
                          />
                        ) : null}
                      </div>
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
                      <InvoiceDisplayBadge inv={inv} />
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
        query={{
          sort: sort !== "issued" ? sort : undefined,
          dir: dir !== "desc" ? dir : undefined,
          ...listFilterParams,
        }}
      />
    </div>
  );
}
