import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminDashboard() {
  const admin = createAdminClient();

  const [
    { count: customerCount },
    { count: productCount },
    { count: orderCount },
    { count: standingOrderCount },
  ] = await Promise.all([
    admin.from("customers").select("*", { count: "exact", head: true }),
    admin.from("products").select("*", { count: "exact", head: true }),
    admin.from("orders").select("*", { count: "exact", head: true }),
    admin.from("standing_orders").select("*", { count: "exact", head: true }),
  ]);

  const cards = [
    {
      href: "/admin/customers",
      title: "Customers",
      value: customerCount ?? 0,
      blurb: "Create accounts and manage wholesale businesses.",
    },
    {
      href: "/admin/products",
      title: "Products",
      value: productCount ?? 0,
      blurb: "Manage the catalog and base prices.",
    },
    {
      href: "/admin/pricing",
      title: "Pricing",
      value: "→",
      blurb: "Assign custom per-customer pricing.",
    },
    {
      href: "/admin/orders",
      title: "Orders",
      value: orderCount ?? 0,
      blurb: "View orders and update fulfillment status.",
    },
    {
      href: "/admin/standing-orders",
      title: "Standing Orders",
      value: standingOrderCount ?? 0,
      blurb: "Recurring orders generated automatically.",
    },
    {
      href: "/admin/utilities",
      title: "Utilities",
      value: "→",
      blurb: "Delivery fee, delivery minimum, and time windows.",
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-stone-900">
        Dashboard
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        Manage customers, products, and per-customer pricing.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm transition hover:border-brand-400 hover:shadow"
          >
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-stone-900">{card.title}</h2>
              <span className="text-2xl font-bold text-brand-600">
                {card.value}
              </span>
            </div>
            <p className="mt-2 text-sm text-stone-500">{card.blurb}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
