import type { InvoiceStatus } from "@/lib/types";

// The at-a-glance state shown on the admin invoice list. It's DERIVED, not a
// stored column. Three of the states are inferred from signals we already own:
//   • "processing" — an ACH payment authorized and genuinely clearing
//     (stripe_payment_id set while still unpaid/overdue — see getOverdueInvoices).
//   • "check mailed" — the customer says a check is in the mail (check_mailed_at
//     set while still unpaid/overdue). Lifts the credit stop like an in-flight
//     payment, but on our word rather than Stripe's, so the badge shows how long
//     we've been waiting — an open-ended tag is only safe if it stays visible.
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
  | "check_mailed"
  | "declined"
  | "incomplete"
  | "overdue"
  | "unpaid"
  | "canceled";

// Shape every badge call site must supply.
export type InvoiceBadgeInput = {
  status: InvoiceStatus;
  stripe_payment_id: string | null;
  payment_note: string | null;
  check_mailed_at: string | null;
};

// Whole days since a timestamp, floored at 0. Drives the "waiting N days" copy.
export function daysWaiting(since: string, now: Date = new Date()): number {
  const ms = now.getTime() - new Date(since).getTime();
  return Math.max(0, Math.floor(ms / 86_400_000));
}

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

export function isCheckMailed(inv: {
  status: string;
  check_mailed_at: string | null;
}): boolean {
  return (
    (inv.status === "unpaid" || inv.status === "overdue") &&
    !!inv.check_mailed_at
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

export function invoiceDisplayState(
  inv: InvoiceBadgeInput,
): InvoiceDisplayState {
  if (inv.status === "canceled") return "canceled";
  if (inv.status === "paid") return "paid";
  // A real Stripe payment outranks our own "they said it's mailed" tag.
  if (isPaymentInFlight(inv)) return "processing";
  if (isCheckMailed(inv)) return "check_mailed";
  if (isPaymentDeclined(inv)) return "declined";
  if (isPaymentIncomplete(inv)) return "incomplete";
  return inv.status; // "unpaid" | "overdue"
}

const STYLES: Record<InvoiceDisplayState, string> = {
  paid: "bg-green-100 text-green-800",
  processing: "bg-blue-100 text-blue-800",
  // Indigo, not the blue of "processing": both mean money on the way, but this
  // one rests on the customer's word, so it shouldn't read as the same thing.
  check_mailed: "bg-indigo-100 text-indigo-800",
  declined: "bg-red-600 text-white",
  incomplete: "bg-orange-100 text-orange-800",
  overdue: "bg-red-100 text-red-800",
  unpaid: "bg-amber-100 text-amber-800",
  canceled: "bg-stone-200 text-stone-500 line-through",
};

const LABELS: Record<InvoiceDisplayState, string> = {
  paid: "Paid",
  processing: "Payment Processing",
  check_mailed: "Check Mailed",
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
  variant = "admin",
}: {
  inv: InvoiceBadgeInput;
  // "admin" tooltips expose the raw payment_note (internal follow-up detail);
  // "customer" uses friendly generic copy so the internal note never leaks.
  variant?: "admin" | "customer";
}) {
  const state = invoiceDisplayState(inv);
  let title: string | undefined;
  // The tag never expires, so the age is the only thing standing between a
  // forgotten check and a customer ordering on credit indefinitely. Admins see
  // it on the badge itself; customers just see "Check Mailed".
  let suffix = "";
  if (state === "check_mailed" && inv.check_mailed_at) {
    const d = daysWaiting(inv.check_mailed_at);
    if (variant === "admin") suffix = ` · ${d}d`;
    title =
      variant === "customer"
        ? "We're waiting on your mailed check."
        : `Customer reported a check mailed ${d} day${d === 1 ? "" : "s"} ago (${new Date(inv.check_mailed_at).toLocaleDateString()}). Credit stop is lifted until this is marked paid or changed.`;
  } else if (state === "processing") {
    title = "Payment authorized — clearing (usually a few business days)";
  } else if (state === "declined") {
    title =
      variant === "customer"
        ? "This payment didn't go through — please try again."
        : (inv.payment_note ?? undefined);
  } else if (state === "incomplete") {
    title =
      variant === "customer"
        ? "Payment was started but not completed — please finish it or try again."
        : (inv.payment_note ?? undefined);
  }
  return (
    <span
      title={title}
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[state]}`}
    >
      {LABELS[state]}
      {suffix}
    </span>
  );
}
