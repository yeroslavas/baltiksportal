"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart";
import { formatPrice } from "@/lib/format";
import { placeOrder } from "./actions";

export function CheckoutView() {
  const { items, total, clear } = useCart();
  const router = useRouter();
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

  async function confirm() {
    setSubmitting(true);
    setError(null);
    const res = await placeOrder(
      items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
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
    <div className="mt-6 space-y-4">
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
          disabled={submitting}
          className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {submitting ? "Placing order…" : "Confirm order"}
        </button>
      </div>
    </div>
  );
}
