import { creditOverrideActive } from "@/lib/invoices";
import { formatDateOnly } from "@/lib/format";

// Small amber pill marking a customer with an ACTIVE time-boxed credit-hold
// override (they can order despite overdue invoices, through `until`). Renders
// nothing when there's no active override. Server component — reused on the
// admin Customers list and Invoices list. See creditOverrideActive().
export function CreditOverrideBadge({
  until,
  reason,
}: {
  until: string | null;
  reason?: string | null;
}) {
  if (!creditOverrideActive(until) || !until) return null;
  const title = reason
    ? `Credit-hold override through ${formatDateOnly(until)} — ${reason}`
    : `Credit-hold override through ${formatDateOnly(until)}`;
  return (
    <span
      title={title}
      className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800"
    >
      Override → {formatDateOnly(until)}
    </span>
  );
}
