import Link from "next/link";
import { getUser, isAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOverdueInvoices } from "@/lib/invoices";
import { formatPrice } from "@/lib/format";

// Full-width notice for a signed-in customer with past-due invoices: new orders
// are paused until they pay. Renders nothing for admins or customers in good
// standing. Drop it under the CustomerHeader on the ordering pages.
export async function OverdueBanner() {
  const user = await getUser();
  if (!user || isAdmin(user.email)) return null;

  const admin = createAdminClient();
  const { data: customer } = await admin
    .from("customers")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (!customer) return null;

  const overdue = await getOverdueInvoices(customer.id, admin);
  if (overdue.length === 0) return null;
  const owed = overdue.reduce((s, i) => s + Number(i.total_amount), 0);

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
