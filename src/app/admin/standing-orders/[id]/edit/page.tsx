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
        .select("id, name, unit")
        .eq("is_active", true)
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
  const products = [...(activeProducts ?? [])] as {
    id: string;
    name: string;
    unit: string;
  }[];
  const present = new Set(products.map((p) => p.id));
  const missingIds = items.map((i) => i.product_id).filter((pid) => !present.has(pid));
  if (missingIds.length > 0) {
    const { data: extra } = await admin
      .from("products")
      .select("id, name, unit")
      .in("id", missingIds);
    for (const p of extra ?? []) products.push(p);
    products.sort((a, b) => a.name.localeCompare(b.name));
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
          products={products}
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
