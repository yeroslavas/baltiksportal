"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { DELIVERY_TIME_WINDOWS, type FulfillmentType } from "@/lib/types";
import { placeOrder } from "./actions";

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function CheckoutView() {
  const { items, total, clear } = useCart();
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<FulfillmentType>("delivery");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
        Your cart is empty.{" "}
        <Link
          href="/catalog"
          className="font-medium text-brand-700 hover:underline"
        >
          Browse the catalog
        </Link>
        .
      </div>
    );
  }

  const ready = Boolean(date && time);
  const noun = fulfillment === "pickup" ? "Pickup" : "Delivery";

  async function confirm() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const res = await placeOrder(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      { type: fulfillment, date, time },
    );
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    clear();
    router.push(`/orders/${res.orderId}?placed=1`);
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5">
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">Fulfillment</p>
          <div className="inline-flex rounded-lg border border-stone-300 p-0.5">
            {(["delivery", "pickup"] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setFulfillment(opt)}
                className={`rounded-md px-4 py-1.5 text-sm font-medium capitalize transition ${
                  fulfillment === opt
                    ? "bg-brand-600 text-white"
                    : "text-stone-600 hover:text-stone-900"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              {noun} date *
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-stone-700">
              {noun} time *
            </label>
            <select
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className={inputClass}
            >
              <option value="" disabled>
                Select a window…
              </option>
              {DELIVERY_TIME_WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {items.map((i) => (
          <li
            key={i.productId}
            className="flex items-center justify-between gap-4 px-5 py-3 text-sm"
          >
            <span className="min-w-0 flex-1 truncate text-stone-700">
              {i.name} × {i.quantity}
            </span>
            <span className="font-medium text-stone-900">
              {formatPrice(i.unitPrice * i.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <span className="text-sm text-stone-500">Order total</span>
        <span className="text-xl font-bold text-stone-900">
          {formatPrice(total)}
        </span>
      </div>
      <p className="text-xs text-stone-500">
        Final prices are confirmed at submission using your account pricing.
      </p>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between">
        <Link
          href="/cart"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to cart
        </Link>
        <button
          type="button"
          onClick={confirm}
          disabled={!ready || submitting}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Placing order…" : "Confirm order"}
        </button>
      </div>
    </div>
  );
}
