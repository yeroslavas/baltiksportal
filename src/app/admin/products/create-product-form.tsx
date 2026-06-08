"use client";

import { useActionState, useEffect, useRef } from "react";
import { createProduct, type ActionState } from "./actions";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function CreateProductForm({
  products,
}: {
  products: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    createProduct,
    initialState,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Name *</label>
        <input name="name" required className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">SKU *</label>
        <input
          name="sku"
          required
          placeholder="e.g. Bulk_Everything"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Description</label>
        <input name="description" className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Product photo
        </label>
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
        <p className="text-xs text-stone-500">
          Optional. JPG, PNG, or WebP, up to 4MB.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Unit</label>
        <input
          name="unit"
          defaultValue="dozen"
          placeholder="dozen"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">
          Base price (USD) *
        </label>
        <input
          name="base_price"
          type="number"
          step="0.01"
          min="0"
          required
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Position in catalog
        </label>
        <select name="position" defaultValue="end" className={inputClass}>
          <option value="end">At the end</option>
          <option value="start">At the beginning</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              After: {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-2 border-t border-stone-200 pt-4 sm:col-span-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Internal / reporting (optional)
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Bake time</label>
        <input name="bake_time" placeholder="e.g. Late" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Product type</label>
        <input name="product_type" placeholder="e.g. EVT" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report group</label>
        <input name="report_group" placeholder="e.g. bagels" className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report unit</label>
        <input
          name="report_unit"
          placeholder="e.g. each_bagel"
          className={inputClass}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report count</label>
        <input
          name="report_count"
          type="number"
          min="0"
          step="1"
          placeholder="e.g. 12"
          className={inputClass}
        />
      </div>

      {state.error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 sm:col-span-2">
          {state.error}
        </p>
      ) : null}
      {state.success ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 sm:col-span-2">
          {state.success}
        </p>
      ) : null}

      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "Adding…" : "Add product"}
        </button>
      </div>
    </form>
  );
}
