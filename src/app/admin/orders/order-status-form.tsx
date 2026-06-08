"use client";

import { useRef } from "react";
import { updateOrderStatus } from "./actions";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";

export function OrderStatusForm({
  id,
  status,
}: {
  id: string;
  status: OrderStatus;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={updateOrderStatus}>
      <input type="hidden" name="id" value={id} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm capitalize text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      >
        {ORDER_STATUSES.map((s) => (
          <option key={s} value={s} className="capitalize">
            {s}
          </option>
        ))}
      </select>
    </form>
  );
}
