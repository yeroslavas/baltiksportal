"use client";

import { useState } from "react";
import { useCart } from "@/lib/cart";

export function AddToCart({
  productId,
  name,
  unit,
  unitPrice,
  allowHalf,
}: {
  productId: string;
  name: string;
  unit: string;
  unitPrice: number;
  allowHalf: boolean;
}) {
  const { addItem } = useCart();
  const step = allowHalf ? 0.5 : 1;
  // Stored as a string so the field can be fully cleared while typing (needed
  // to replace "1" with another number on mobile); snapped to the allowed
  // increment (>= step) on use.
  const [qty, setQty] = useState("1");
  const [added, setAdded] = useState(false);

  const normalizedQty = () => {
    const n = parseFloat(qty);
    if (!Number.isFinite(n) || n < step) return step;
    return Math.round(n / step) * step;
  };

  return (
    <div className="mt-4 flex items-center gap-2">
      <input
        type="number"
        min={step}
        step={step}
        inputMode={allowHalf ? "decimal" : "numeric"}
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={() => setQty(String(normalizedQty()))}
        aria-label={`Quantity of ${name}`}
        className="w-16 rounded-lg border border-stone-300 px-2 py-1.5 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
      />
      <button
        type="button"
        onClick={() => {
          const n = normalizedQty();
          setQty(String(n));
          addItem({ productId, name, unit, unitPrice, allowHalf }, n);
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
