import Image from "next/image";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import type { Customer, Product, CustomerPricing, PricedProduct } from "@/lib/types";
import { AddToCart } from "./add-to-cart";
import { CustomerHeader } from "@/components/customer-header";
import { OverdueBanner } from "@/components/overdue-banner";

export default async function CatalogPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Resolve this user's customer record (RLS limits this to their own row).
  // Only the customer-facing columns — internal fields (sales_rep/tier/notes)
  // aren't selected, and the API roles can't read them either (see schema.sql).
  const { data: customer } = await supabase
    .from("customers")
    .select("id, business_name, slice_fee")
    .eq("user_id", user.id)
    .maybeSingle<Pick<Customer, "id" | "business_name" | "slice_fee">>();
  const sliceFee = Number(customer?.slice_fee ?? 0);

  // Active catalog + this customer's price overrides. Customer-facing columns
  // only (no sku/report_* — those are restricted from the API roles too).
  const { data: productsData } = await supabase
    .from("products")
    .select("id, name, description, unit, base_price, sort_order, image_url, allow_half_dozen, allow_slicing")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name");
  const products = (productsData ?? []) as Product[];

  let pricing: CustomerPricing[] = [];
  if (customer) {
    const { data: pricingData } = await supabase
      .from("customer_pricing")
      .select("*")
      .eq("customer_id", customer.id);
    pricing = (pricingData ?? []) as CustomerPricing[];
  }

  const priceByProduct = new Map(
    pricing.map((p) => [p.product_id, p.custom_price]),
  );

  const items: PricedProduct[] = products.map((product) => {
    const custom = priceByProduct.get(product.id);
    return {
      ...product,
      effective_price: custom ?? product.base_price,
      has_custom_price: custom !== undefined,
    };
  });

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <OverdueBanner />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Product Catalog
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          {customer
            ? "Prices shown are your account's pricing."
            : "No customer profile is linked to this account yet — showing base prices."}
        </p>

        {items.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
            No products are available yet. Check back soon.
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full bg-stone-100">
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-4xl">
                      🥯
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-5">
                  <div className="flex-1">
                    <h2 className="font-semibold text-stone-900">{item.name}</h2>
                    {item.description ? (
                      <p className="mt-1 text-sm text-stone-500">
                        {item.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xl font-bold text-stone-900">
                        {formatPrice(item.effective_price)}
                      </p>
                      <p className="text-xs text-stone-500">per {item.unit}</p>
                    </div>
                  </div>
                  <AddToCart
                    productId={item.id}
                    name={item.name}
                    unit={item.unit}
                    unitPrice={item.effective_price}
                    allowHalf={item.allow_half_dozen}
                    allowSlicing={item.allow_slicing}
                    sliceFee={sliceFee}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
