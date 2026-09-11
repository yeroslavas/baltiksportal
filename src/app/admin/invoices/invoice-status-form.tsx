"use client";

import { useRef } from "react";
import { setInvoiceStatus } from "./actions";
import {
  INVOICE_STATUSES,
  CHECK_MAILED_OPTION,
  type InvoiceStatus,
} from "@/lib/types";

// Auto-submitting status select — mirrors the order status control. Setting it
// to "paid" stamps the paid date; reverting clears it (and clears the Stripe
// in-flight tag, so the invoice isn't mistaken for a payment in progress).
//
// This sets the STORED status (unpaid/paid/overdue). It sits next to the display
// badge, which shows the richer DERIVED state (Processing/Declined/Incomplete)
// inferred from the Stripe tag and payment note — those aren't settable by hand,
// which is why the badge stays and this only offers the three real statuses.
// Deliberately styled quiet so the badge remains the thing you read at a glance.
export function InvoiceStatusForm({
  id,
  status,
  checkMailedAt = null,
}: {
  id: string;
  status: InvoiceStatus;
  // Non-null means the invoice is flagged "check in the mail" — the select shows
  // that as the current choice even though the stored status is still unpaid.
  checkMailedAt?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const awaitingCheck =
    !!checkMailedAt && (status === "unpaid" || status === "overdue");
  // "Check mailed" is only offerable while the invoice is still owed; on a paid
  // or canceled invoice there's nothing to wait for.
  const canMarkCheckMailed = status === "unpaid" || status === "overdue";
  return (
    <form ref={formRef} action={setInvoiceStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={awaitingCheck ? CHECK_MAILED_OPTION : status}
        onChange={() => formRef.current?.requestSubmit()}
        title="Set the stored status, or flag that a check is in the mail"
        aria-label="Set invoice status"
        className="rounded-lg border border-stone-200 bg-white px-1.5 py-1 text-xs capitalize text-stone-500 outline-none transition hover:border-stone-300 hover:text-stone-700 focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {INVOICE_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
        {canMarkCheckMailed ? (
          <option value={CHECK_MAILED_OPTION}>check mailed</option>
        ) : null}
      </select>
    </form>
  );
}
