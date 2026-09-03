import { formatDateOnly } from "@/lib/format";

// A customer's at-a-glance credit standing:
//   • current  — no qualifying overdue invoices (good standing)
//   • override — an admin credit-hold override is active (ordering allowed)
//   • stop     — overdue invoices with no override (new orders blocked)
export type CreditStatus = "current" | "override" | "stop";

const CONFIG: Record<CreditStatus, { cls: string; label: string }> = {
  current: {
    cls: "border-green-300 bg-green-50 text-green-800",
    label: "Current",
  },
  override: {
    cls: "border-amber-300 bg-amber-50 text-amber-800",
    label: "Credit override",
  },
  stop: {
    cls: "border-red-300 bg-red-50 text-red-800",
    label: "Credit stop",
  },
};

export function CreditStatusTag({
  status,
  until,
}: {
  status: CreditStatus;
  until?: string | null;
}) {
  const { cls, label } = CONFIG[status];
  const title =
    status === "override" && until
      ? `Overdue, but ordering allowed through ${formatDateOnly(until)}`
      : status === "stop"
        ? "Overdue invoices — new orders blocked"
        : "No overdue invoices";
  return (
    <span
      title={title}
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}
    >
      {label}
    </span>
  );
}
