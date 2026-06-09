import { formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";

export function FulfillmentInfo({
  order,
}: {
  order: Pick<Order, "fulfillment_type" | "delivery_date" | "delivery_time">;
}) {
  const label = order.fulfillment_type === "pickup" ? "Pickup" : "Delivery";
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm">
      <span className="font-medium text-stone-900">{label}</span>
      {order.delivery_date ? (
        <span className="text-stone-600">
          {" "}
          · {formatDate(order.delivery_date)}
        </span>
      ) : null}
      {order.delivery_time ? (
        <span className="text-stone-600"> · {order.delivery_time}</span>
      ) : null}
    </div>
  );
}
