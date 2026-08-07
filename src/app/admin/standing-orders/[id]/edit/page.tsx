import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateStandingOrder, deleteStandingOrder } from "../../actions";
import { StandingOrderForm } from "../../standing-order-form";
import type { StandingOrder, StandingOrderItem } from "@/lib/types";

type Row = StandingOrder & { customers: { business_name: string } | null };

export default async function EditStandingOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ created?: string }>;
}) {
  const { id } = await params;
  const { created } = await searchParams;
  const admin = createAdminClient();

  const [{ data: so }, { data: itemData }, { data: activeProducts }] =
    await Promise.all([
      admin
        .from("standing_orders")
        .select("*, customers(business_name)")
        .eq("id", id)
        .maybeSingle<Row>(),
      admin
        .from("standing_order_items")
        .select("*")
        .eq("standing_order_id", id),
      admin
        .from("products")
        .select("id, name, unit, sort_order, allow_half_dozen, allow_slicing")
        .eq("is_active", true)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("name"),
    ]);

  if (!so) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Standing order not found
        </h1>
        <Link
          href="/admin/standing-orders"
          className="font-medium text-brand-700 hover:underline"
        >
          ← Back to standing orders
        </Link>
      </div>
    );
  }

  const items = (itemData ?? []) as StandingOrderItem[];

  // Include any item product that's no longer active, so its quantity shows and
  // isn't silently dropped on save.
  type Prod = {
    id: string;
    name: string;
    unit: string;
    sort_order: number | null;
    allow_half_dozen: boolean;
    allow_slicing: boolean;
  };
  const products = [...(activeProducts ?? [])] as Prod[];
  const present = new Set(products.map((p) => p.id));
  const missingIds = items.map((i) => i.product_id).filter((pid) => !present.has(pid));
  if (missingIds.length > 0) {
    const { data: extra } = await admin
      .from("products")
      .select("id, name, unit, sort_order, allow_half_dozen")
      .in("id", missingIds);
    for (const p of (extra ?? []) as Prod[]) products.push(p);
    // Keep catalog order (sort_order, then name) after merging the extras.
    products.sort((a, b) => {
      const sa = a.sort_order ?? Infinity;
      const sb = b.sort_order ?? Infinity;
      return sa !== sb ? sa - sb : a.name.localeCompare(b.name);
    });
  }

  const initial = {
    id: so.id,
    customerName: so.customers?.business_name ?? "—",
    fulfillmentType: so.fulfillment_type,
    daysOfWeek: so.days_of_week,
    intervalWeeks: so.interval_weeks,
    anchorDate: so.anchor_date,
    endDate: so.end_date,
    leadDays: so.lead_days,
    isActive: so.is_active,
    skipDates: so.skip_dates,
    note: so.note,
    items: Object.fromEntries(items.map((i) => [i.product_id, i.quantity])),
    slicedItems: items.filter((i) => i.sliced).map((i) => i.product_id),
  };

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
          Edit standing order
        </h1>
        <p className="mt-1 text-sm text-stone-500">{initial.customerName}</p>
      </div>

      {created ? (
        <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
          Standing order created.
        </p>
      ) : null}

      <section className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
        <StandingOrderForm
          mode="edit"
          action={updateStandingOrder}
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            unit: p.unit,
            allowHalf: p.allow_half_dozen,
            allowSlicing: p.allow_slicing,
          }))}
          initial={initial}
        />
      </section>

      <section className="rounded-2xl border border-red-200 bg-red-50/40 p-6">
        <h2 className="font-semibold text-stone-900">Delete standing order</h2>
        <p className="mt-1 text-sm text-stone-500">
          Stops all future generation. Orders already created from it keep their
          history.
        </p>
        <form action={deleteStandingOrder} className="mt-4">
          <input type="hidden" name="id" value={so.id} />
          <button
            type="submit"
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
          >
            Delete
          </button>
        </form>
      </section>
    </div>
  );
}
