import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice, formatDateOnly, formatPhone } from "@/lib/format";
import { businessToday } from "@/lib/standing-orders";
import {
  getOverdueInvoices,
  creditOverrideActive,
  invoiceAmountDue,
} from "@/lib/invoices";
import {
  CreditStatusTag,
  type CreditStatus,
} from "@/components/credit-status-tag";
import { InvoiceDisplayBadge } from "@/components/invoice-display-badge";
import type { Customer, Invoice } from "@/lib/types";

// Why an outstanding invoice ISN'T holding the customer on credit stop. Mirrors
// the exclusions in getOverdueInvoices — an invoice is only skipped for one of
// these reasons, so the page can always say which one applies.
function notBlockingReason(inv: Invoice, today: string): string {
  if (inv.stripe_payment_id) return "payment in flight";
  if (inv.check_mailed_at) return "check reported mailed";
  if (inv.status === "unpaid" && inv.due_date >= today) return "not due yet";
  return "not counted";
}

// Credit summary for one customer: what they owe, and specifically which invoices
// are holding them on credit stop. The blocking set comes straight from
// getOverdueInvoices — the same function behind the checkout gate and the
// standing-order generator — so this page cannot disagree with the real lock.
export default async function AdminCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: customer } = await admin
    .from("customers")
    .select("*")
    .eq("id", id)
    .maybeSingle<Customer>();

  if (!customer) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Customer not found
        </h1>
        <Link
          href="/admin/customers"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to customers
        </Link>
      </div>
    );
  }

  const today = businessToday();

  const [blocking, { data: openData }] = await Promise.all([
    getOverdueInvoices(customer.id, admin),
    admin
      .from("invoices")
      .select("*")
      .eq("customer_id", customer.id)
      .in("status", ["unpaid", "overdue"])
      .order("due_date"),
  ]);

  // Partition the open invoices using the canonical blocking set rather than
  // re-deriving the rule here, which could drift from the actual lock.
  const blockingIds = new Set(blocking.map((b) => b.id));
  const open = (openData ?? []) as Invoice[];
  const blockingInvoices = open.filter((i) => blockingIds.has(i.id));
  const otherOpen = open.filter((i) => !blockingIds.has(i.id));

  const sum = (rows: Invoice[]) =>
    rows.reduce((s, i) => s + invoiceAmountDue(i), 0);

  const overrideActive = creditOverrideActive(
    customer.credit_hold_override_until,
  );
  const status: CreditStatus = overrideActive
    ? "override"
    : blockingInvoices.length > 0
      ? "stop"
      : "current";

  const linkClass = "font-medium text-brand-700 hover:underline";

  const invoiceRows = (rows: Invoice[], showReason: boolean) => (
    <table className="w-full min-w-[32rem] text-left text-sm">
      <thead className="text-xs uppercase tracking-wide text-stone-500">
        <tr className="border-b border-stone-200">
          <th className="px-6 py-2">Invoice</th>
          <th className="px-6 py-2">Status</th>
          <th className="px-6 py-2">Due</th>
          {showReason ? <th className="px-6 py-2">Why not counted</th> : null}
          <th className="px-6 py-2 text-right">Amount due</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((i) => (
          <tr key={i.id} className="border-b border-stone-100 last:border-0">
            <td className="px-6 py-2">
              <Link href={`/admin/invoices/${i.id}`} className={linkClass}>
                {i.invoice_number}
              </Link>
            </td>
            <td className="px-6 py-2">
              <InvoiceDisplayBadge inv={i} />
            </td>
            <td className="px-6 py-2 text-stone-600">
              {formatDateOnly(i.due_date)}
            </td>
            {showReason ? (
              <td className="px-6 py-2 text-stone-500">
                {notBlockingReason(i, today)}
              </td>
            ) : null}
            <td className="px-6 py-2 text-right font-medium text-stone-900">
              {formatPrice(invoiceAmountDue(i))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/customers"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to customers
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold tracking-tight text-stone-900">
            {customer.business_name}
            <CreditStatusTag
              status={status}
              until={customer.credit_hold_override_until}
            />
          </h1>
          <div className="flex flex-wrap items-center gap-4 text-sm">
            <Link
              href={`/admin/customers/${customer.id}/edit`}
              className={linkClass}
            >
              Edit
            </Link>
            <Link
              href={`/admin/pricing?customer=${customer.id}`}
              className={linkClass}
            >
              Pricing
            </Link>
            <Link
              href={`/admin/invoices?q=${encodeURIComponent(customer.business_name)}`}
              className={linkClass}
            >
              All invoices
            </Link>
          </div>
        </div>
        <p className="mt-1 text-sm text-stone-500">
          {customer.contact_name ?? "—"}
          {customer.email ? ` · ${customer.email}` : ""}
          {customer.phone ? ` · ${formatPhone(customer.phone)}` : ""}
          {` · ${customer.invoice_terms_days}-day terms`}
          {customer.allow_invoicing ? "" : " · invoicing off"}
        </p>
      </div>

      {overrideActive && customer.credit_hold_override_until ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-4 text-sm text-amber-900">
          <p className="font-semibold">
            Credit override active through{" "}
            {formatDateOnly(customer.credit_hold_override_until)}
          </p>
          <p className="mt-1">
            Ordering is allowed despite the invoices below.
            {customer.credit_hold_override_reason
              ? ` Reason: ${customer.credit_hold_override_reason}`
              : ""}
            {customer.credit_hold_override_set_by
              ? ` — set by ${customer.credit_hold_override_set_by}`
              : ""}
          </p>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-6 py-4">
          <h2 className="font-semibold text-stone-900">
            {overrideActive && blockingInvoices.length > 0
              ? "Would block ordering (override is lifting it)"
              : "Causing the credit stop"}
          </h2>
          <span className="text-sm font-semibold text-stone-900">
            {formatPrice(sum(blockingInvoices))}
          </span>
        </div>
        {blockingInvoices.length === 0 ? (
          <p className="px-6 py-5 text-sm text-stone-500">
            Nothing is blocking this customer from ordering.
          </p>
        ) : (
          invoiceRows(blockingInvoices, false)
        )}
      </section>

      <section className="overflow-x-auto rounded-2xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-6 py-4">
          <h2 className="font-semibold text-stone-900">
            Outstanding, not causing the stop
          </h2>
          <span className="text-sm font-semibold text-stone-900">
            {formatPrice(sum(otherOpen))}
          </span>
        </div>
        {otherOpen.length === 0 ? (
          <p className="px-6 py-5 text-sm text-stone-500">
            No other outstanding invoices.
          </p>
        ) : (
          invoiceRows(otherOpen, true)
        )}
      </section>

      <p className="text-sm text-stone-500">
        Total outstanding:{" "}
        <span className="font-semibold text-stone-900">
          {formatPrice(sum(open))}
        </span>
        {" · "}
        {open.length} open invoice{open.length === 1 ? "" : "s"}
      </p>
    </div>
  );
}
