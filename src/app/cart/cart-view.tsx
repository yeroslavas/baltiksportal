"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { QuantityInput } from "@/components/quantity-input";

export function CartView({
  deliveryFee,
  deliveryMinimum,
}: {
  deliveryFee: number;
  deliveryMinimum: number;
}) {
  const { items, total, updateQuantity, removeItem } = useCart();

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

  return (
    <div className="mt-6 space-y-4">
      <ul className="divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
        {items.map((i) => (
          <li key={i.productId} className="flex items-center gap-4 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-stone-900">{i.name}</p>
              <p className="text-xs text-stone-500">
                {formatPrice(i.unitPrice)} per {i.unit}
              </p>
            </div>
            <QuantityInput
              value={i.quantity}
              step={i.allowHalf ? 0.5 : 1}
              onCommit={(q) => updateQuantity(i.productId, q)}
              ariaLabel={`Quantity of ${i.name}`}
              className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
            />
            <p className="w-20 text-right font-semibold text-stone-900">
              {formatPrice(i.unitPrice * i.quantity)}
            </p>
            <button
              type="button"
              onClick={() => removeItem(i.productId)}
              className="text-sm font-medium text-stone-400 transition hover:text-red-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white px-5 py-4">
        <span className="text-sm text-stone-500">Subtotal</span>
        <span className="text-xl font-bold text-stone-900">
          {formatPrice(total)}
        </span>
      </div>
      <p className="text-xs text-stone-500">
        Delivery orders under {formatPrice(deliveryMinimum)} add a{" "}
        {formatPrice(deliveryFee)} fee — choose delivery or pickup at checkout.
      </p>

      <div className="flex items-center justify-between">
        <Link
          href="/catalog"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Continue shopping
        </Link>
        <Link
          href="/checkout"
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
