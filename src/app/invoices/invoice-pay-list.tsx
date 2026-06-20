"use client";

import { useState } from "react";
import Link from "next/link";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { formatPrice, formatDate, formatDateOnly } from "@/lib/format";
import { payInvoices } from "./actions";
import type { InvoiceStatus } from "@/lib/types";

export type InvoiceListItem = {
  id: string;
  invoice_number: string;
  total_amount: number;
  amount_due: number; // total minus any admin credit
  status: InvoiceStatus;
  due_date: string;
  order_date: string | null;
};

export function InvoicePayList({
  invoices,
}: {
  invoices: InvoiceListItem[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const payableCount = invoices.filter(
    (i) => i.status === "unpaid" || i.status === "overdue",
  ).length;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectedTotal = invoices
    .filter((i) => selected.has(i.id))
    .reduce((s, i) => s + i.amount_due, 0);

  return (
    <form action={payInvoices}>
      <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {invoices.map((inv) => {
          const payable = inv.status === "unpaid" || inv.status === "overdue";
          return (
            <li key={inv.id} className="flex items-center gap-3 px-5 py-4">
              {payable ? (
                <input
                  type="checkbox"
                  name="invoice_ids"
                  value={inv.id}
                  checked={selected.has(inv.id)}
                  onChange={() => toggle(inv.id)}
                  aria-label={`Select ${inv.invoice_number} to pay`}
                  className="h-4 w-4 shrink-0 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
                />
              ) : (
                <span className="h-4 w-4 shrink-0" aria-hidden />
              )}
              <Link
                href={`/invoices/${inv.id}`}
                className="flex flex-1 items-center justify-between gap-4 transition hover:opacity-80"
              >
                <div>
                  <p className="font-semibold text-stone-900">
                    {inv.invoice_number}
                  </p>
                  <p className="text-xs text-stone-500">
                    {inv.order_date
                      ? `Ordered ${formatDate(inv.order_date)} · `
                      : ""}
                    Due {formatDateOnly(inv.due_date)}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <InvoiceStatusBadge status={inv.status} />
                  <span className="w-24 text-right">
                    <span className="block font-semibold text-stone-900">
                      {formatPrice(inv.amount_due)}
                    </span>
                    {inv.amount_due < inv.total_amount ? (
                      <span className="block text-[11px] text-green-700">
                        credit applied
                      </span>
                    ) : null}
                  </span>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      {payableCount > 0 ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white px-5 py-4">
          <p className="text-sm text-stone-600">
            {selected.size === 0
              ? "Tick invoices to pay them together in one transaction."
              : `${selected.size} selected · ${formatPrice(selectedTotal)}`}
          </p>
          <button
            type="submit"
            disabled={selected.size === 0}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            Pay selected
          </button>
        </div>
      ) : null}
    </form>
  );
}
