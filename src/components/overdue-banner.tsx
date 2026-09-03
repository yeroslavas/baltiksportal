import Link from "next/link";
import { getUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOverdueInvoices, creditOverrideActive } from "@/lib/invoices";
import { formatPrice, formatDateOnly } from "@/lib/format";

// Full-width notice for a signed-in customer with past-due invoices: new orders
// are paused until they pay. Renders nothing for admins or customers in good
// standing. Drop it under the CustomerHeader on the ordering pages.
export async function OverdueBanner() {
  const user = await getUser();
  if (!user || isAdmin(user.email)) return null;

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id, credit_hold_override_until")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string; credit_hold_override_until: string | null }>();
  if (!customer) return null;

  const overdue = await getOverdueInvoices(customer.id, admin);
  if (overdue.length === 0) return null;
  const owed = overdue.reduce((s, i) => s + Number(i.total_amount), 0);

  // Admin granted a time-boxed override: soften to a non-blocking reminder —
  // ordering stays open through the override date instead of "orders paused".
  const overrideUntil = customer.credit_hold_override_until;
  if (creditOverrideActive(overrideUntil) && overrideUntil) {
    return (
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm text-amber-800">
          <p>
            <span className="font-semibold">Payment reminder:</span>{" "}
            {overdue.length} overdue invoice{overdue.length > 1 ? "s" : ""} (
            {formatPrice(owed)}). Please pay soon — your account can keep ordering
            through {formatDateOnly(overrideUntil)}.
          </p>
          <Link
            href="/invoices"
            className="shrink-0 font-semibold text-amber-900 underline hover:no-underline"
          >
            Pay now →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-sm text-red-800">
        <p>
          <span className="font-semibold">Account on hold:</span>{" "}
          {overdue.length} overdue invoice{overdue.length > 1 ? "s" : ""} (
          {formatPrice(owed)}). New orders are paused until they&apos;re paid.
        </p>
        <Link
          href="/invoices"
          className="shrink-0 font-semibold text-red-900 underline hover:no-underline"
        >
          Pay now →
        </Link>
      </div>
    </div>
  );
}
