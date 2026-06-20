import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDate, formatDateOnly } from "@/lib/format";
import { InvoiceStatusForm } from "../invoice-status-form";
import { PaymentNoteForm } from "../payment-note-form";
import { ApplyCreditForm } from "../apply-credit-form";
import { FulfillmentInfo } from "@/components/fulfillment-info";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { invoiceAmountDue } from "@/lib/invoices";
import type { Invoice, Order, OrderItem } from "@/lib/types";

type InvoiceWithRefs = Invoice & {
  customers: {
    business_name: string;
    contact_name: string | null;
    email: string | null;
    address: string | null;
  } | null;
};

export default async function AdminInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();
  const { data: invoice } = await admin
    .from("invoices")
    .select("*, customers(business_name, contact_name, email, address)")
    .eq("id", id)
    .maybeSingle<InvoiceWithRefs>();

  if (!invoice) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Invoice not found
        </h1>
        <Link
          href="/admin/invoices"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to invoices
        </Link>
      </div>
    );
  }

  const [{ data: order }, { data: itemsData }] = await Promise.all([
    admin
      .from("orders")
      .select("*")
      .eq("id", invoice.order_id)
      .maybeSingle<Order>(),
    admin.from("order_items").select("*").eq("order_id", invoice.order_id),
  ]);
  const items = (itemsData ?? []) as OrderItem[];
  const deliveryFee = order?.delivery_fee ?? 0;
  const credit = Number(invoice.credit_amount ?? 0);
  const amountDue = invoiceAmountDue(invoice);
  const canCredit = invoice.status === "unpaid" || invoice.status === "overdue";

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/invoices"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to invoices
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-stone-900">
            Invoice {invoice.invoice_number}
          </h1>
          <div className="flex items-center gap-3">
            {invoice.status === "canceled" ? (
              <InvoiceStatusBadge status={invoice.status} />
            ) : (
              <InvoiceStatusForm id={invoice.id} status={invoice.status} />
            )}
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
        <p className="mt-1 text-sm text-stone-500">
          {invoice.customers?.business_name ?? "—"}
          {invoice.customers?.contact_name
            ? ` · ${invoice.customers.contact_name}`
            : ""}
          {invoice.customers?.email ? ` · ${invoice.customers.email}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 rounded-2xl border border-stone-200 bg-white px-6 py-4 text-sm shadow-sm sm:grid-cols-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Issued</p>
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
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Paid</p>
          <p className="mt-1 font-medium text-stone-900">
            {invoice.paid_at ? formatDate(invoice.paid_at) : "—"}
          </p>
          {invoice.stripe_payment_id ? (
            <p
              className="mt-0.5 truncate text-[11px] text-stone-400"
              title={invoice.stripe_payment_id}
            >
              Stripe: {invoice.stripe_payment_id}
            </p>
          ) : null}
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-stone-400">Order</p>
          {order ? (
            <Link
              href={`/admin/orders/${order.id}`}
              className="mt-1 inline-block font-medium text-brand-700 hover:underline"
            >
              #{order.order_number}
            </Link>
          ) : (
            <p className="mt-1 font-medium text-stone-900">—</p>
          )}
        </div>
      </div>

      {order ? <FulfillmentInfo order={order} /> : null}

      <section className="rounded-2xl border border-stone-200 bg-white px-6 py-4 shadow-sm">
        <PaymentNoteForm id={invoice.id} note={invoice.payment_note} />
      </section>

      <section className="space-y-3 rounded-2xl border border-stone-200 bg-white px-6 py-4 shadow-sm">
        <div>
          <h2 className="font-semibold text-stone-900">Credits & adjustments</h2>
          <p className="mt-0.5 text-sm text-stone-500">
            Reduce the amount due for a shorted/damaged order or a pricing fix. A
            credit covering the full balance settles the invoice.
          </p>
        </div>
        {credit > 0 ? (
          <p className="rounded-lg bg-stone-50 px-3 py-2 text-sm text-stone-700">
            <span className="font-medium">{formatPrice(credit)} credited</span>
            {invoice.credit_reason ? ` — ${invoice.credit_reason}` : ""}
          </p>
        ) : null}
        {canCredit ? (
          <ApplyCreditForm id={invoice.id} amountDue={amountDue} />
        ) : (
          <p className="text-sm text-stone-400">
            This invoice is {invoice.status} — credits can only be applied while
            it&apos;s unpaid.
          </p>
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full min-w-[36rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-6 py-3">Item</th>
              <th className="px-6 py-3 text-right">Qty</th>
              <th className="px-6 py-3 text-right">Unit price</th>
              <th className="px-6 py-3 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b border-stone-100 last:border-0">
                <td className="px-6 py-3 font-medium text-stone-900">
                  {i.product_name}
                </td>
                <td className="px-6 py-3 text-right text-stone-600">
                  {i.quantity}
                </td>
                <td className="px-6 py-3 text-right text-stone-600">
                  {formatPrice(i.unit_price)}
                </td>
                <td className="px-6 py-3 text-right font-medium text-stone-900">
                  {formatPrice(i.line_total)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-200">
              <td colSpan={3} className="px-6 py-2 text-right text-sm text-stone-500">
                Subtotal
              </td>
              <td className="px-6 py-2 text-right text-sm text-stone-900">
                {formatPrice(invoice.total_amount - deliveryFee)}
              </td>
            </tr>
            {deliveryFee > 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-2 text-right text-sm text-stone-500">
                  Delivery fee
                </td>
                <td className="px-6 py-2 text-right text-sm text-stone-900">
                  {formatPrice(deliveryFee)}
                </td>
              </tr>
            ) : null}
            {credit > 0 ? (
              <>
                <tr>
                  <td colSpan={3} className="px-6 py-2 text-right text-sm text-stone-500">
                    Order total
                  </td>
                  <td className="px-6 py-2 text-right text-sm text-stone-900">
                    {formatPrice(invoice.total_amount)}
                  </td>
                </tr>
                <tr>
                  <td colSpan={3} className="px-6 py-2 text-right text-sm text-green-700">
                    Credit
                  </td>
                  <td className="px-6 py-2 text-right text-sm text-green-700">
                    −{formatPrice(credit)}
                  </td>
                </tr>
              </>
            ) : null}
            <tr className="border-t border-stone-200">
              <td colSpan={3} className="px-6 py-3 text-right text-sm font-medium text-stone-700">
                Amount due
              </td>
              <td className="px-6 py-3 text-right text-lg font-bold text-stone-900">
                {formatPrice(amountDue)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>
    </div>
  );
}
