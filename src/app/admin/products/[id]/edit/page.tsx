import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Product } from "@/lib/types";
import { EditProductForm } from "./edit-product-form";

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const admin = createAdminClient();

  const { data: product } = await admin
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle<Product>();

  if (!product) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Product not found
        </h1>
        <Link
          href="/admin/products"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to products
        </Link>
      </div>
    );
  }

  const { data: rows } = await admin
    .from("products")
    .select("id,name")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  const others = (rows ?? []).filter((p) => p.id !== id);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/products"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to products
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          Edit product
        </h1>
        <p className="mt-1 text-sm text-stone-500">{product.name}</p>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <EditProductForm product={product} others={others} />
      </section>
    </div>
  );
}
