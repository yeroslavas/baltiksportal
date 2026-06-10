"use client";

import { useRef } from "react";
import { setInvoiceStatus } from "./actions";
import { INVOICE_STATUSES, type InvoiceStatus } from "@/lib/types";

// Auto-submitting status select — mirrors the order status control. Setting it
// to "paid" stamps the paid date; reverting clears it.
export function InvoiceStatusForm({
  id,
  status,
}: {
  id: string;
  status: InvoiceStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={setInvoiceStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm capitalize text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {INVOICE_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
