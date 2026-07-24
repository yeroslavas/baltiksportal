import type { InvoiceStatus } from "@/lib/types";

// The at-a-glance state shown on the admin invoice list. It's DERIVED, not a
// stored column. Three of the states are inferred from signals we already own:
//   • "processing" — an ACH payment authorized and genuinely clearing
//     (stripe_payment_id set while still unpaid/overdue — see getOverdueInvoices).
//   • "declined"   — a payment was attempted and hard-failed/returned/expired.
//     The reconciler + failure handlers write a payment_note starting "⚠ …".
//   • "incomplete" — a payment the customer STARTED but never completed (e.g. ACH
//     micro-deposit verification pending; it'll expire). The reconciler writes a
//     payment_note starting "⏳ …". Distinct from "declined" (bank rejection) so
//     follow-up differs: "please finish verifying" vs "your bank declined".
// Both markers are written only by our code; manual admin notes never use them,
// and the in-flight tag is cleared when either is set. Precedence: canceled/paid
// win, then an in-flight payment (a fresh attempt supersedes an old flag), then
// declined, then incomplete, then plain unpaid/overdue.
export type InvoiceDisplayState =
  | "paid"
  | "processing"
  | "declined"
  | "incomplete"
  | "overdue"
  | "unpaid"
  | "canceled";

// Note-prefix markers our failure/reconcile handlers write (see the Stripe
// webhook, autopay, and src/lib/reconcile.ts). Manual admin notes never use them.
const FAILURE_MARK = "⚠"; // hard-failed / returned / declined / expired
const INCOMPLETE_MARK = "⏳"; // started but never completed (verification pending)

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

export function isPaymentIncomplete(inv: {
  status: string;
  stripe_payment_id: string | null;
  payment_note: string | null;
}): boolean {
  return (
    (inv.status === "unpaid" || inv.status === "overdue") &&
    !inv.stripe_payment_id &&
    !!inv.payment_note?.trimStart().startsWith(INCOMPLETE_MARK)
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
  if (isPaymentIncomplete(inv)) return "incomplete";
  return inv.status; // "unpaid" | "overdue"
}

const STYLES: Record<InvoiceDisplayState, string> = {
  paid: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  declined: "bg-red-600 text-white",
  incomplete: "bg-orange-100 text-orange-800",
  overdue: "bg-red-100 text-red-800",
  unpaid: "bg-amber-100 text-amber-800",
  canceled: "bg-stone-200 text-stone-500 line-through",
};

const LABELS: Record<InvoiceDisplayState, string> = {
  paid: "Paid",
  processing: "Payment Processing",
  declined: "Payment Declined",
  incomplete: "Incomplete",
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
      : state === "declined" || state === "incomplete"
        ? (inv.payment_note ?? undefined) // the Stripe reason / status detail
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
