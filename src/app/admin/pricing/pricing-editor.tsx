"use client";

import { useActionState } from "react";
import { savePricing, type ActionState } from "./actions";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";

const initialState: ActionState = { error: null, success: null };

export function PricingEditor({
  customerId,
  products,
  currentPrices,
}: {
  customerId: string;
  products: Product[];
  currentPrices: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState(
    savePricing,
    initialState,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="customer_id" value={customerId} />

      <div className="overflow-x-auto">
      <table className="w-full min-w-[34rem] text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-stone-500">
          <tr className="border-b border-stone-200">
            <th className="px-6 py-3">Product</th>
            <th className="px-6 py-3">Base price</th>
            <th className="px-6 py-3">Custom price</th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => (
            <tr key={p.id} className="border-b border-stone-100 last:border-0">
              <td className="px-6 py-3">
                <div className="font-medium text-stone-900">{p.name}</div>
                <div className="text-xs text-stone-500">per {p.unit}</div>
              </td>
              <td className="px-6 py-3 text-stone-600">
                {formatPrice(p.base_price)}
              </td>
              <td className="px-6 py-3">
                <div className="flex items-center gap-1">
                  <span className="text-stone-400">$</span>
                  <input
                    name={`price_${p.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    defaultValue={currentPrices[p.id] ?? ""}
                    placeholder="base"
                    className="w-28 rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-stone-200 px-6 py-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save pricing"}
        </button>
        {state.error ? (
          <span className="text-sm text-red-700">{state.error}</span>
        ) : null}
        {state.success ? (
          <span className="text-sm text-green-700">{state.success}</span>
        ) : null}
        <span className="ml-auto text-xs text-stone-400">
          Leave a field blank to use the base price.
        </span>
      </div>
    </form>
  );
}
