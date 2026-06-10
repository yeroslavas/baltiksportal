import type { InvoiceStatus } from "@/lib/types";

// Outstanding (amber), overdue (red), paid (green) — a clear at-a-glance signal
// on both the customer and admin invoice lists.
const styles: Record<InvoiceStatus, string> = {
  unpaid: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium capitalize ${styles[status]}`}
    >
      {status}
    </span>
  );
}
