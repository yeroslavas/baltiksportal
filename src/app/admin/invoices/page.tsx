import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { InvoiceStatusForm } from "./invoice-status-form";
import { RecomputeOverdueButton } from "./recompute-overdue-button";
import type { Invoice } from "@/lib/types";

type InvoiceRow = Invoice & {
  customers: { business_name: string } | null;
  orders: { order_number: number } | null;
};

export default async function AdminInvoicesPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("invoices")
    .select("*, customers(business_name), orders(order_number)")
    .order("issue_date", { ascending: false })
    .order("invoice_number", { ascending: false });
  const invoices = (data ?? []) as InvoiceRow[];

  // At-a-glance outstanding summary.
  const unpaidCount = invoices.filter((i) => i.status === "unpaid").length;
  const overdueCount = invoices.filter((i) => i.status === "overdue").length;
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((sum, i) => sum + Number(i.total_amount), 0);

  const summary = [
    { label: "Outstanding balance", value: formatPrice(outstanding) },
    { label: "Unpaid", value: unpaidCount },
    { label: "Overdue", value: overdueCount },
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-stone-500">
          Overdue status is recalculated on demand — run it to flag unpaid
          invoices past their due date.
        </p>
        <RecomputeOverdueButton />
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          All invoices ({invoices.length})
        </h2>
        {invoices.length === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">
            No invoices yet. They&apos;re created automatically when an order is
            placed.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-stone-500">
                <tr className="border-b border-stone-200">
                  <th className="px-6 py-3">Invoice</th>
                  <th className="px-6 py-3">Customer</th>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Issued</th>
                  <th className="px-6 py-3">Due</th>
                  <th className="px-6 py-3">Total</th>
                  <th className="px-6 py-3">Status</th>
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
                      {formatDateOnly(inv.due_date)}
                    </td>
                    <td className="px-6 py-3 text-stone-900">
                      {formatPrice(inv.total_amount)}
                    </td>
                    <td className="px-6 py-3">
                      <InvoiceStatusForm id={inv.id} status={inv.status} />
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
    </div>
  );
}
