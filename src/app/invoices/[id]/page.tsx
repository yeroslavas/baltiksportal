import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { FulfillmentInfo } from "@/components/fulfillment-info";
import { formatPrice, formatDateOnly } from "@/lib/format";
import { payInvoice } from "../actions";
import type { Invoice, Order, OrderItem } from "@/lib/types";

export default async function InvoiceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ paid?: string; payerror?: string }>;
}) {
  const { id } = await params;
  const { paid, payerror } = await searchParams;
  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();
  const label = customer?.business_name ?? user.email ?? "";

  // RLS: only the customer's own invoice resolves; anything else returns null.
  const { data: invoice } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle<Invoice>();

  if (!invoice) {
    return (
      <div className="flex flex-1 flex-col">
        <CustomerHeader label={label} isAdminUser={isAdmin(user.email)} />
        <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
          <h1 className="text-2xl font-bold text-stone-900">
            Invoice not found
          </h1>
          <Link
            href="/invoices"
            className="mt-4 inline-block font-medium text-brand-700 hover:underline"
          >
            ← Back to invoices
          </Link>
        </main>
      </div>
    );
  }

  const [{ data: order }, { data: itemsData }] = await Promise.all([
    supabase
      .from("orders")
      .select("*")
      .eq("id", invoice.order_id)
      .maybeSingle<Order>(),
    supabase.from("order_items").select("*").eq("order_id", invoice.order_id),
  ]);
  const items = (itemsData ?? []) as OrderItem[];
  const deliveryFee = order?.delivery_fee ?? 0;

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader label={label} isAdminUser={isAdmin(user.email)} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <Link
          href="/invoices"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to invoices
        </Link>

        {payerror ? (
          <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
            <p className="font-semibold">We couldn&apos;t start the payment.</p>
            <p className="mt-1 break-words">{payerror}</p>
          </div>
        ) : null}

        {paid === "1" ? (
          <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
            <p className="font-semibold">Thank you — your payment was submitted.</p>
            <p>
              Bank (ACH) transfers can take a few business days to clear. This
              invoice updates to Paid once it&apos;s confirmed.
            </p>
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Invoice {invoice.invoice_number}
          </h1>
          <div className="flex items-center gap-3">
            <InvoiceStatusBadge status={invoice.status} />
            {invoice.status === "unpaid" || invoice.status === "overdue" ? (
              <form action={payInvoice}>
                <input type="hidden" name="invoice_id" value={invoice.id} />
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
                >
                  Pay now
                </button>
              </form>
            ) : null}
            <a
              href={`/invoices/${invoice.id}/pdf`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
            >
              Download PDF
            </a>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4 text-sm sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">
              Issued
            </p>
            <p className="mt-1 font-medium text-stone-900">
              {formatDateOnly(invoice.issue_date)}
            </p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-wide text-stone-400">Due</p>
            <p className="mt-1 font-medium text-stone-900">
              {formatDateOnly(invoice.due_date)}
            </p>
          </div>
          {order ? (
            <div>
              <p className="text-xs uppercase tracking-wide text-stone-400">
                Order
              </p>
              <Link
                href={`/orders/${order.id}`}
                className="mt-1 inline-block font-medium text-brand-700 hover:underline"
              >
                #{order.order_number}
              </Link>
            </div>
          ) : null}
        </div>

        {order ? (
          <div className="mt-4">
            <FulfillmentInfo order={order} />
          </div>
        ) : null}

        <section className="mt-6 overflow-x-auto rounded-2xl border border-stone-200 bg-white">
          <table className="w-full min-w-[28rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="px-5 py-3">Item</th>
                <th className="px-5 py-3 text-right">Qty</th>
                <th className="px-5 py-3 text-right">Unit price</th>
                <th className="px-5 py-3 text-right">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr
                  key={i.id}
                  className="border-b border-stone-100 last:border-0"
                >
                  <td className="px-5 py-3 font-medium text-stone-900">
                    {i.product_name}
                  </td>
                  <td className="px-5 py-3 text-right text-stone-600">
                    {i.quantity}
                  </td>
                  <td className="px-5 py-3 text-right text-stone-600">
                    {formatPrice(i.unit_price)}
                  </td>
                  <td className="px-5 py-3 text-right font-medium text-stone-900">
                    {formatPrice(i.line_total)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-stone-200">
                <td colSpan={3} className="px-5 py-2 text-right text-sm text-stone-500">
                  Subtotal
                </td>
                <td className="px-5 py-2 text-right text-sm text-stone-900">
                  {formatPrice(invoice.total_amount - deliveryFee)}
                </td>
              </tr>
              {deliveryFee > 0 ? (
                <tr>
                  <td colSpan={3} className="px-5 py-2 text-right text-sm text-stone-500">
                    Delivery fee
                  </td>
                  <td className="px-5 py-2 text-right text-sm text-stone-900">
                    {formatPrice(deliveryFee)}
                  </td>
                </tr>
              ) : null}
              <tr className="border-t border-stone-200">
                <td colSpan={3} className="px-5 py-3 text-right text-sm font-medium text-stone-700">
                  Total due
                </td>
                <td className="px-5 py-3 text-right text-lg font-bold text-stone-900">
                  {formatPrice(invoice.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      </main>
    </div>
  );
}
