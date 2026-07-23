import type { InvoiceStatus } from "@/lib/types";

// The at-a-glance state shown on the admin invoice list. It's DERIVED, not a
// stored column. Two of the five are inferred from signals we already own:
//   • "processing" — an ACH payment authorized but not yet settled
//     (stripe_payment_id set while still unpaid/overdue — see getOverdueInvoices).
//   • "declined"   — a payment was attempted and failed/returned. Every failure
//     path (flagPaymentFailed / recordAutopayFailure / clearInFlightForPaymentIntent
//     / reconcile) writes a payment_note starting with "⚠ … failed/returned", and
//     clears the in-flight tag. Nothing else writes that marker, so an owing
//     invoice with no tag + a "⚠" note means the last attempt was declined.
// Precedence matters: canceled/paid win, then an in-flight payment (a fresh
// attempt supersedes an old decline), then a decline, then plain unpaid/overdue.
export type InvoiceDisplayState =
  | "paid"
  | "processing"
  | "declined"
  | "overdue"
  | "unpaid"
  | "canceled";

// Marker every failure path prefixes its payment_note with (see failure handlers
// in the Stripe webhook, autopay, and reconcile). Manual admin notes never use it.
const FAILURE_MARK = "⚠";

export function isPaymentInFlight(inv: {
  status: string;
  stripe_payment_id: string | null;
}): boolean {
  return (
    (inv.status === "unpaid" || inv.status === "overdue") &&
    !!inv.stripe_payment_id
  );
}

export function isPaymentDeclined(inv: {
  status: string;
  stripe_payment_id: string | null;
  payment_note: string | null;
}): boolean {
  return (
    (inv.status === "unpaid" || inv.status === "overdue") &&
    !inv.stripe_payment_id &&
    !!inv.payment_note?.trimStart().startsWith(FAILURE_MARK)
  );
}

export function invoiceDisplayState(inv: {
  status: InvoiceStatus;
  stripe_payment_id: string | null;
  payment_note: string | null;
}): InvoiceDisplayState {
  if (inv.status === "canceled") return "canceled";
  if (inv.status === "paid") return "paid";
  if (isPaymentInFlight(inv)) return "processing";
  if (isPaymentDeclined(inv)) return "declined";
  return inv.status; // "unpaid" | "overdue"
}

const STYLES: Record<InvoiceDisplayState, string> = {
  paid: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  declined: "bg-red-600 text-white",
  overdue: "bg-red-100 text-red-800",
  unpaid: "bg-amber-100 text-amber-800",
  canceled: "bg-stone-200 text-stone-500 line-through",
};

const LABELS: Record<InvoiceDisplayState, string> = {
  paid: "Paid",
  processing: "Payment Processing",
  declined: "Payment Declined",
  overdue: "Overdue",
  unpaid: "Unpaid",
  canceled: "Canceled",
};

// Read-only, color-coded status badge for the admin invoice list. Status is
// changed from the invoice detail page, not here.
export function InvoiceDisplayBadge({
  inv,
}: {
  inv: {
    status: InvoiceStatus;
    stripe_payment_id: string | null;
    payment_note: string | null;
  };
}) {
  const state = invoiceDisplayState(inv);
  const title =
    state === "processing"
      ? "ACH payment authorized — clearing (usually a few business days)"
      : state === "declined"
        ? (inv.payment_note ?? undefined) // the Stripe decline/return reason
        : undefined;
  return (
    <span
      title={title}
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[state]}`}
    >
      {LABELS[state]}
    </span>
  );
}
