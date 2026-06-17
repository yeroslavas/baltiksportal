"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { createOrderAsAdmin } from "./actions";

type Priced = {
  id: string;
  name: string;
  unit: string;
  price: number;
  hasOverride: boolean;
  allowHalf: boolean;
};

// Snap a typed quantity to the product's allowed increment (0.5 / whole).
const snapQty = (p: Priced, raw: string | undefined) => {
  const step = p.allowHalf ? 0.5 : 1;
  const n = Math.max(0, Number(raw) || 0);
  return Math.round(n / step) * step;
};

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function CreateOrderForm({
  customerId,
  deliveryWindow,
  waiveDeliveryMinimum,
  products,
  deliveryFee: deliveryFeeRate,
  deliveryMinimum,
  minDate,
}: {
  customerId: string;
  deliveryWindow: string | null;
  waiveDeliveryMinimum: boolean;
  products: Priced[];
  deliveryFee: number;
  deliveryMinimum: number;
  minDate: string;
}) {
  const router = useRouter();
  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">(
    "delivery",
  );
  const [date, setDate] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = products
    .map((p) => ({ p, q: snapQty(p, qty[p.id]) }))
    .filter((x) => x.q > 0);
  const subtotal = lines.reduce((s, x) => s + x.p.price * x.q, 0);
  const fee =
    fulfillment === "delivery" &&
    !waiveDeliveryMinimum &&
    subtotal > 0 &&
    subtotal < deliveryMinimum
      ? deliveryFeeRate
      : 0;
  const total = subtotal + fee;
  const noun = fulfillment === "pickup" ? "Pickup" : "Delivery";
  const ready = Boolean(date) && lines.length > 0 && !submitting;

  async function submit() {
    if (!ready) return;
    setSubmitting(true);
    setError(null);
    const res = await createOrderAsAdmin(
      customerId,
      lines.map((x) => ({ productId: x.p.id, quantity: x.q })),
      { type: fulfillment, date },
    );
    if (res.error) {
      setError(res.error);
      setSubmitting(false);
      return;
    }
    router.push(`/admin/orders/${res.orderId}`);
  }

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">
            {noun} date *
          </label>
          <input
            type="date"
            required
            min={minDate}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">
            {noun} window
          </label>
          <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-700">
            {deliveryWindow ?? "To be confirmed by Baltik's"}
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-stone-200">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-400">
            <tr className="border-b border-stone-200">
              <th className="px-4 py-2.5">Product</th>
              <th className="px-4 py-2.5 text-right">Unit price</th>
              <th className="px-4 py-2.5 text-right">Qty</th>
              <th className="px-4 py-2.5 text-right">Line total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {products.map((p) => {
              const q = snapQty(p, qty[p.id]);
              return (
                <tr key={p.id}>
                  <td className="px-4 py-2 text-stone-800">
                    {p.name}
                    <span className="text-stone-400"> · {p.unit}</span>
                    {p.hasOverride ? (
                      <span className="ml-2 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-medium text-brand-700">
                        Your price
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right text-stone-600">
                    {formatPrice(p.price)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={p.allowHalf ? 0.5 : 1}
                      inputMode={p.allowHalf ? "decimal" : "numeric"}
                      value={qty[p.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQty((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      aria-label={`Quantity of ${p.name}`}
                      className="w-20 rounded-lg border border-stone-300 px-2 py-1 text-right text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                    />
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-stone-900">
                    {q > 0 ? formatPrice(p.price * q) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-2 rounded-2xl border border-stone-200 bg-white px-5 py-4 sm:ml-auto sm:max-w-xs">
        <div className="flex justify-between text-sm">
          <span className="text-stone-500">Subtotal</span>
          <span className="text-stone-900">{formatPrice(subtotal)}</span>
        </div>
        {fulfillment === "delivery" ? (
          <div className="flex justify-between text-sm">
            <span className="text-stone-500">Delivery fee</span>
            <span className="text-stone-900">
              {fee > 0 ? formatPrice(fee) : "Free"}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-stone-100 pt-2">
          <span className="text-sm font-medium text-stone-700">Total</span>
          <span className="text-lg font-bold text-stone-900">
            {formatPrice(total)}
          </span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={!ready}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create order"}
        </button>
      </div>
    </div>
  );
}
