import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatPrice } from "@/lib/format";
import type { Product } from "@/lib/types";
import { CreateProductForm } from "./create-product-form";
import { toggleProductActive } from "./actions";

export default async function AdminProductsPage() {
  const admin = createAdminClient();
  const { data } = await admin
    .from("products")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  const products = (data ?? []) as Product[];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Products
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          The base price applies to every customer unless overridden in Pricing.
          Inactive products are hidden from customers.
        </p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-semibold text-stone-900">New product</h2>
        <CreateProductForm
          products={products.map((p) => ({ id: p.id, name: p.name }))}
        />
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white shadow-sm">
        <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
          All products ({products.length})
        </h2>
        {products.length === 0 ? (
          <p className="px-6 py-8 text-sm text-stone-500">No products yet.</p>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Unit</th>
                <th className="px-6 py-3">Base price</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-6 py-3">
                    <div className="font-medium text-stone-900">{p.name}</div>
                    {p.description ? (
                      <div className="text-xs text-stone-500">
                        {p.description}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-6 py-3 text-stone-600">{p.unit}</td>
                  <td className="px-6 py-3 text-stone-900">
                    {formatPrice(p.base_price)}
                  </td>
                  <td className="px-6 py-3">
                    {p.is_active ? (
                      <span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-medium text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-stone-200 px-2.5 py-1 text-xs font-medium text-stone-600">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-4">
                      <Link
                        href={`/admin/products/${p.id}/edit`}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        Edit
                      </Link>
                      <form action={toggleProductActive}>
                        <input type="hidden" name="id" value={p.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={String(p.is_active)}
                        />
                        <button
                          type="submit"
                          className="font-medium text-stone-500 hover:text-stone-700 hover:underline"
                        >
                          {p.is_active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </section>
    </div>
  );
}
