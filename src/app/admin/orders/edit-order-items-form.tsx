"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/format";
import { updateOrderItems } from "./actions";

// Same shape the create-order form uses: the customer's effective price per
// product, plus the increment/slicing rules.
export type PricedProductOption = {
  id: string;
  name: string;
  unit: string;
  price: number;
  hasOverride: boolean;
  allowHalf: boolean;
  allowSlicing: boolean;
};

// Snap a typed quantity to the product's allowed increment (0.5 / whole) —
// mirrors create-order-form, and priceOrder snaps again server-side.
const snapQty = (p: PricedProductOption, raw: string | undefined) => {
  const step = p.allowHalf ? 0.5 : 1;
  const n = Math.max(0, Number(raw) || 0);
  return Math.round(n / step) * step;
};

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function EditOrderItemsForm({
  orderId,
  products,
  initialQty,
  initialSliced,
  currentTotal,
  deliveryFee: deliveryFeeRate,
  deliveryMinimum,
  sliceFee,
  waiveDeliveryMinimum,
  isDelivery,
  warning,
}: {
  orderId: string;
  products: PricedProductOption[];
  initialQty: Record<string, string>;
  initialSliced: Record<string, boolean>;
  currentTotal: number;
  deliveryFee: number;
  deliveryMinimum: number;
  sliceFee: number;
  waiveDeliveryMinimum: boolean;
  isDelivery: boolean;
  // Set when the order is past cutoff / already in production, so the admin
  // knows they may be changing something already being made.
  warning: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<Record<string, string>>(initialQty);
  const [sliced, setSliced] = useState<Record<string, boolean>>(initialSliced);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview only. The server re-prices through priceOrder and that result wins —
  // this just has to agree closely enough to be useful before saving.
  const lines = products
    .map((p) => ({ p, q: snapQty(p, qty[p.id]) }))
    .filter((x) => x.q > 0);
  const subtotal = lines.reduce((s, x) => s + x.p.price * x.q, 0);
  const slicedQty = lines.reduce(
    (s, x) => (sliced[x.p.id] && x.p.allowSlicing ? s + x.q : s),
    0,
  );
  const slicingTotal = sliceFee * slicedQty;
  const fee =
    isDelivery &&
    !waiveDeliveryMinimum &&
    subtotal + slicingTotal < deliveryMinimum
      ? deliveryFeeRate
      : 0;
  const newTotal = Math.round((subtotal + slicingTotal + fee) * 100) / 100;
  const changed = Math.abs(newTotal - currentTotal) >= 0.005;

  const reset = () => {
    setQty(initialQty);
    setSliced(initialSliced);
    setError(null);
  };

  async function save() {
    setSaving(true);
    setError(null);
    const res = await updateOrderItems(
      orderId,
      lines.map((x) => ({
        productId: x.p.id,
        quantity: x.q,
        sliced: Boolean(sliced[x.p.id]),
      })),
    );
    setSaving(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
      >
        Edit items
      </button>
    );
  }

  return (
    <div className="w-full">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold text-stone-900">Edit items</h3>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Cancel
        </button>
      </div>

      {warning ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {warning}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-stone-200">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="px-4 py-2">Item</th>
              <th className="px-4 py-2 text-right">Unit price</th>
              <th className="px-4 py-2 text-right">Qty</th>
              <th className="px-4 py-2">Sliced</th>
              <th className="px-4 py-2 text-right">Line total</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => {
              const q = snapQty(p, qty[p.id]);
              return (
                <tr
                  key={p.id}
                  className={`border-b border-stone-100 last:border-0 ${q > 0 ? "" : "opacity-60"}`}
                >
                  <td className="px-4 py-2 font-medium text-stone-900">
                    {p.name}
                    {p.hasOverride ? (
                      <span className="ml-2 text-xs font-normal text-stone-400">
                        custom price
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right text-stone-600">
                    {formatPrice(p.price)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <input
                      type="number"
                      min="0"
                      step={p.allowHalf ? "0.5" : "1"}
                      value={qty[p.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQty((prev) => ({ ...prev, [p.id]: e.target.value }))
                      }
                      className={`${inputClass} w-20 text-right`}
                    />
                  </td>
                  <td className="px-4 py-2">
                    {p.allowSlicing ? (
                      <label className="flex items-center gap-2 text-xs text-stone-600">
                        <input
                          type="checkbox"
                          checked={Boolean(sliced[p.id])}
                          onChange={(e) =>
                            setSliced((prev) => ({
                              ...prev,
                              [p.id]: e.target.checked,
                            }))
                          }
                          className="h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-2 focus:ring-brand-200"
                        />
                        +{formatPrice(sliceFee)}/doz.
                      </label>
                    ) : (
                      <span className="text-xs text-stone-300">—</span>
                    )}
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

      <div className="mt-3 space-y-1 text-sm">
        <div className="flex justify-between text-stone-600">
          <span>Subtotal</span>
          <span>{formatPrice(subtotal)}</span>
        </div>
        {slicingTotal > 0 ? (
          <div className="flex justify-between text-stone-600">
            <span>Slicing</span>
            <span>{formatPrice(slicingTotal)}</span>
          </div>
        ) : null}
        {fee > 0 ? (
          <div className="flex justify-between text-stone-600">
            <span>Delivery fee</span>
            <span>{formatPrice(fee)}</span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-stone-200 pt-1 font-semibold text-stone-900">
          <span>Total</span>
          <span>
            {changed ? (
              <>
                <span className="font-normal text-stone-400 line-through">
                  {formatPrice(currentTotal)}
                </span>{" "}
                {formatPrice(newTotal)}
              </>
            ) : (
              formatPrice(newTotal)
            )}
          </span>
        </div>
      </div>

      {changed ? (
        <p className="mt-2 text-xs text-stone-500">
          The order total changes, so this order&apos;s invoice is updated to
          match. A paid invoice, or one with a payment in flight, is refused —
          credit or refund it first.
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving || lines.length === 0}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save items"}
        </button>
        {lines.length === 0 ? (
          <span className="text-xs text-stone-500">
            An order needs at least one item — cancel the order instead.
          </span>
        ) : null}
      </div>
    </div>
  );
}
