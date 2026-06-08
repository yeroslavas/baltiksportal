"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";

export function AddToCart({
  productId,
  name,
  unit,
  unitPrice,
}: {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
}) {
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  return (
    <div className="mt-4 flex items-center gap-2">
      <input
        type="number"
        min={1}
        value={qty}
        onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
        aria-label={`Quantity of ${name}`}
        className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <button
        type="button"
        onClick={() => {
          addItem({ productId, name, unit, unitPrice }, qty);
          setAdded(true);
          setTimeout(() => setAdded(false), 1500);
        }}
        className="flex-1 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-700"
      >
        {added ? "Added ✓" : "Add to cart"}
      </button>
    </div>
  );
}
