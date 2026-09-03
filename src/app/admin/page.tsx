import Link from "next/link";
import { requireAdmin, isSuperAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessToday, addDays } from "@/lib/standing-orders";
import { formatDateOnly } from "@/lib/format";

export default async function AdminDashboard() {
  const user = await requireAdmin();
  const superAdmin = isSuperAdmin(user.email);
  const admin = createAdminClient();

  const [
    { count: customerCount },
    { count: productCount },
    { count: orderCount },
    { count: standingOrderCount },
    { count: unpaidInvoiceCount },
  ] = await Promise.all([
    admin.from("customers").select("*", { count: "exact", head: true }),
    admin.from("products").select("*", { count: "exact", head: true }),
    admin.from("orders").select("*", { count: "exact", head: true }),
    admin.from("standing_orders").select("*", { count: "exact", head: true }),
    admin
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .in("status", ["unpaid", "overdue"]),
  ]);

  // Active credit-hold overrides (date today or later), soonest-expiring first,
  // so an override about to lapse doesn't silently re-lock an account.
  const today = businessToday();
  const soon = addDays(today, 7);
  const { data: overrideRows } = await admin
    .from("customers")
    .select("id, business_name, credit_hold_override_until")
    .gte("credit_hold_override_until", today)
    .order("credit_hold_override_until");
  const activeOverrides = (overrideRows ?? []) as {
    id: string;
    business_name: string;
    credit_hold_override_until: string;
  }[];
  const expiringSoon = activeOverrides.filter(
    (c) => c.credit_hold_override_until <= soon,
  );

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
      href: "/admin/invoices",
      title: "Invoices",
      value: unpaidInvoiceCount ?? 0,
      blurb: "Outstanding invoices awaiting payment.",
    },
    {
      href: "/admin/utilities",
      title: "Utilities",
      value: "→",
      blurb: "Delivery fee, delivery minimum, time windows, and business info.",
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
        {cards
          .filter((card) => superAdmin || card.href !== "/admin/utilities")
          .map((card) => (
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

      {activeOverrides.length > 0 ? (
        <section className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-amber-900">
              Credit-hold overrides ({activeOverrides.length} active)
            </h2>
            <Link
              href="/admin/customers?override=1"
              className="text-sm font-semibold text-amber-800 underline hover:no-underline"
            >
              View all →
            </Link>
          </div>
          {expiringSoon.length > 0 ? (
            <div className="mt-3">
              <p className="text-sm text-amber-800">
                Expiring within 7 days — these accounts re-lock if still unpaid:
              </p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {expiringSoon.map((c) => (
                  <li
                    key={c.id}
                    className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs text-amber-900"
                  >
                    {c.business_name} · through{" "}
                    {formatDateOnly(c.credit_hold_override_until)}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-sm text-amber-800">
              None expiring in the next 7 days.
            </p>
          )}
        </section>
      ) : null}
    </div>
  );
}
