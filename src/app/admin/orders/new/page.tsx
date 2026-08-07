import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSettings } from "@/lib/settings";
import { businessToday } from "@/lib/standing-orders";
import type { Product } from "@/lib/types";
import { CreateOrderForm } from "../create-order-form";

type Cust = {
  id: string;
  business_name: string;
  delivery_window: string | null;
  waive_delivery_minimum: boolean;
  slice_fee: number;
};

export default async function AdminNewOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const { customer: selectedId } = await searchParams;
  const admin = createAdminClient();

  const [{ data: customerData }, { data: productData }, settings] =
    await Promise.all([
      admin
        .from("customers")
        .select(
          "id, business_name, delivery_window, waive_delivery_minimum, slice_fee",
        )
        .order("business_name"),
      admin
        .from("products")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name"),
      getSettings(),
    ]);
  const customers = (customerData ?? []) as Cust[];
  const products = (productData ?? []) as Product[];
  const selected = selectedId
    ? customers.find((c) => c.id === selectedId)
    : undefined;

  // Resolve the selected customer's effective prices (override or base).
  let priced: {
    id: string;
    name: string;
    unit: string;
    price: number;
    hasOverride: boolean;
    allowHalf: boolean;
    allowSlicing: boolean;
  }[] = [];
  if (selected) {
    const { data: pricingData } = await admin
      .from("customer_pricing")
      .select("product_id, custom_price")
      .eq("customer_id", selected.id);
    const overrides = new Map(
      (pricingData ?? []).map((p) => [p.product_id, Number(p.custom_price)]),
    );
    priced = products.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      price: overrides.has(p.id)
        ? (overrides.get(p.id) as number)
        : Number(p.base_price),
      hasOverride: overrides.has(p.id),
      allowHalf: p.allow_half_dozen,
      allowSlicing: p.allow_slicing,
    }));
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/orders"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to orders
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          Create order
        </h1>
        <p className="mt-1 text-sm text-stone-500">
          Place an order on a customer&apos;s behalf — uses their pricing and
          window, and isn&apos;t subject to the order cutoff or closed days.
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

      {!selected ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          Select a customer above to start an order.
        </p>
      ) : products.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-sm text-stone-500">
          No active products to order.
        </p>
      ) : (
        <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
          <h2 className="border-b border-stone-200 px-6 py-4 font-semibold text-stone-900">
            Order for {selected.business_name}
          </h2>
          <CreateOrderForm
            key={selected.id}
            customerId={selected.id}
            deliveryWindow={selected.delivery_window}
            waiveDeliveryMinimum={selected.waive_delivery_minimum}
            products={priced}
            deliveryFee={settings.deliveryFee}
            deliveryMinimum={settings.deliveryMinimum}
            sliceFee={Number(selected.slice_fee ?? 0)}
            minDate={businessToday()}
          />
        </section>
      )}
    </div>
  );
}
