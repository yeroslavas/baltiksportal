import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { createStandingOrder } from "../actions";
import { StandingOrderForm } from "../standing-order-form";

export default async function NewStandingOrderPage() {
  const admin = createAdminClient();
  const [{ data: customers }, { data: products }] = await Promise.all([
    admin.from("customers").select("id, business_name").order("business_name"),
    admin
      .from("products")
      .select("id, name, unit, allow_half_dozen, allow_slicing")
      .eq("is_active", true)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name"),
  ]);
  const productOptions = (products ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    allowHalf: p.allow_half_dozen,
    allowSlicing: p.allow_slicing,
  }));

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/admin/standing-orders"
          className="text-sm font-medium text-brand-700 hover:underline"
        >
          ← Back to standing orders
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-stone-900">
          New standing order
        </h1>
      </div>

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <StandingOrderForm
          mode="create"
          action={createStandingOrder}
          customers={customers ?? []}
          products={productOptions}
        />
      </section>
    </div>
  );
}
