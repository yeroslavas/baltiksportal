import Link from "next/link";
import Image from "next/image";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPrice } from "@/lib/format";
import { logout } from "@/app/login/actions";
import type { Customer, Product, CustomerPricing, PricedProduct } from "@/lib/types";

export default async function CatalogPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Resolve this user's customer record (RLS limits this to their own row).
  const { data: customer } = await supabase
    .from("customers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle<Customer>();

  // Active catalog + this customer's price overrides.
  const { data: productsData } = await supabase
    .from("products")
    .select("*")
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
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src="/baltiks-logo.webp"
              width={750}
              height={375}
              alt="Baltik's Bagel"
              priority
              className="h-9 w-auto shrink-0"
            />
            <div className="min-w-0 border-l border-stone-200 pl-3">
              <p className="text-[10px] font-medium uppercase tracking-wide leading-tight text-stone-400">
                Wholesale
              </p>
              <p className="truncate text-sm font-medium leading-tight text-stone-700">
                {customer?.business_name ?? user.email}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            {isAdmin(user.email) ? (
              <Link
                href="/admin"
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                Admin
              </Link>
            ) : null}
            <form action={logout}>
              <button
                type="submit"
                className="rounded-lg border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

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
                className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
              >
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
                  {item.has_custom_price ? (
                    <span className="rounded-full bg-peach px-2.5 py-1 text-xs font-medium text-brand-800">
                      Your price
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
