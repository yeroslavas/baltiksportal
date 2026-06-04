import { createAdminClient } from "@/lib/supabase/admin";
import type { Customer, Product, CustomerPricing } from "@/lib/types";
import { PricingEditor } from "./pricing-editor";

export default async function AdminPricingPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer: selectedId } = await searchParams;
  const admin = createAdminClient();

  const [{ data: customerData }, { data: productData }] = await Promise.all([
    admin.from("customers").select("*").order("business_name"),
    admin.from("products").select("*").eq("is_active", true).order("name"),
  ]);
  const customers = (customerData ?? []) as Customer[];
  const products = (productData ?? []) as Product[];

  const selectedCustomer = selectedId
    ? customers.find((c) => c.id === selectedId)
    : undefined;

  let currentPrices: Record<string, number> = {};
  if (selectedCustomer) {
    const { data: pricingData } = await admin
      .from("customer_pricing")
      .select("*")
      .eq("customer_id", selectedCustomer.id);
    currentPrices = Object.fromEntries(
      ((pricingData ?? []) as CustomerPricing[]).map((p) => [
        p.product_id,
        p.custom_price,
      ]),
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Custom pricing
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Choose a customer, then set their price for any product. Blank fields
          fall back to the base price.
        </p>
      </div>

      <form
        method="get"
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-stone-700">Customer</label>
          <select
            name="customer"
            defaultValue={selectedId ?? ""}
            className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
          >
            <option value="" disabled>
              Select a customer…
            </option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.business_name}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Load
        </button>
      </form>

      {!selectedCustomer ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          {customers.length === 0
            ? "Create a customer first, then set their pricing."
            : "Select a customer above to edit their pricing."}
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          No active products to price yet.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
            Pricing for {selectedCustomer.business_name}
          </h2>
          <PricingEditor
            key={selectedCustomer.id}
            customerId={selectedCustomer.id}
            products={products}
            currentPrices={currentPrices}
          />
        </section>
      )}
    </div>
  );
}
