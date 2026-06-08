"use client";

import { useActionState } from "react";
import Image from "next/image";
import { updateProduct, type ActionState } from "../../actions";
import type { Product } from "@/lib/types";

const initialState: ActionState = { error: null, success: null };

const inputClass =
  "rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200";

export function EditProductForm({
  product,
  others,
}: {
  product: Product;
  others: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    updateProduct,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      <input type="hidden" name="id" value={product.id} />

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Name *</label>
        <input name="name" required defaultValue={product.name} className={inputClass} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">SKU</label>
        <input
          defaultValue={product.sku ?? "—"}
          readOnly
          tabIndex={-1}
          className={`${inputClass} cursor-not-allowed bg-stone-100 text-stone-500`}
        />
        <p className="text-xs text-stone-500">
          Locked — the stable key that links this product to pricing &amp; CSV
          imports. (Need to change it? It ripples to those files, so ask and
          we&apos;ll do it carefully.)
        </p>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Description</label>
        <input
          name="description"
          defaultValue={product.description ?? ""}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">Product photo</label>
        {product.image_url ? (
          <Image
            src={product.image_url}
            alt=""
            width={160}
            height={120}
            className="h-24 w-32 rounded-lg border border-stone-200 object-cover"
          />
        ) : (
          <p className="text-xs text-stone-400">No photo yet.</p>
        )}
        <input
          type="file"
          name="image"
          accept="image/jpeg,image/png,image/webp"
          className="text-sm text-stone-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-600 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-brand-700"
        />
        <p className="text-xs text-stone-500">
          JPG, PNG, or WebP, up to 4MB. Uploading replaces the current photo.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Unit</label>
        <input name="unit" defaultValue={product.unit} className={inputClass} />
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
          defaultValue={product.base_price}
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <label className="text-sm font-medium text-stone-700">
          Position in catalog
        </label>
        <select name="position" defaultValue="keep" className={inputClass}>
          <option value="keep">Keep current position</option>
          <option value="start">Move to the beginning</option>
          <option value="end">Move to the end</option>
          {others.map((p) => (
            <option key={p.id} value={p.id}>
              Move after: {p.name}
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
        <input name="bake_time" defaultValue={product.bake_time ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Product type</label>
        <input name="product_type" defaultValue={product.product_type ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report group</label>
        <input name="report_group" defaultValue={product.report_group ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report unit</label>
        <input name="report_unit" defaultValue={product.report_unit ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium text-stone-700">Report count</label>
        <input
          name="report_count"
          type="number"
          min="0"
          step="1"
          defaultValue={product.report_count ?? ""}
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
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
