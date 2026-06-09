// Marks an order that was generated automatically from a standing order.
export function StandingOrderBadge() {
  return (
    <span
      title="Generated automatically from a standing order"
      className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700"
    >
      ↻ Standing
    </span>
  );
}
