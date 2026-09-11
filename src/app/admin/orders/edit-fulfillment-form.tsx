"use client";

import { useActionState, useState } from "react";
import {
  updateOrderFulfillment,
  type FulfillmentEditState,
} from "./actions";
import { submitOnEnter } from "@/lib/submit-on-enter";
import { formatDate } from "@/lib/format";
import type { Order } from "@/lib/types";

const initialState: FulfillmentEditState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function EditFulfillmentForm({
  order,
  deliveryWindows,
}: {
  order: Pick<
    Order,
    "id" | "fulfillment_type" | "delivery_date" | "delivery_time" | "status"
  >;
  deliveryWindows: string[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    updateOrderFulfillment,
    initialState,
  );

  const label = order.fulfillment_type === "pickup" ? "Pickup" : "Delivery";

  // Keep the order's current window selectable even if it's no longer an offered
  // option, so saving doesn't silently drop it.
  const windows =
    order.delivery_time && !deliveryWindows.includes(order.delivery_time)
      ? [order.delivery_time, ...deliveryWindows]
      : deliveryWindows;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-5 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
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
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          {open ? "Cancel" : "Edit"}
        </button>
      </div>

      {open ? (
        <form
          action={formAction}
          onKeyDown={submitOnEnter}
          className="mt-4 border-t border-stone-200 pt-4"
        >
          <input type="hidden" name="id" value={order.id} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Type</label>
              <select
                name="fulfillment_type"
                defaultValue={order.fulfillment_type}
                className={inputClass}
              >
                <option value="delivery">Delivery</option>
                <option value="pickup">Pickup</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">Date</label>
              <input
                name="delivery_date"
                type="date"
                required
                defaultValue={order.delivery_date ?? ""}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-stone-700">
                Window
              </label>
              <select
                name="delivery_time"
                defaultValue={order.delivery_time ?? ""}
                className={inputClass}
              >
                <option value="">— none —</option>
                {windows.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="mt-3 text-xs text-stone-500">
            Changing the date also moves the invoice&apos;s due date, since net
            terms run from the fulfillment date. Items and their prices are not
            re-priced. A paid or canceled invoice is left as issued.
          </p>

          {state.error ? (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {state.error}
            </p>
          ) : null}
          {state.success ? (
            <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              {state.success}
            </p>
          ) : null}

          <div className="mt-4">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
