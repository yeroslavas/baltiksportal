import Link from "next/link";
import { requireUser, isAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { CustomerHeader } from "@/components/customer-header";
import { InvoiceStatusBadge } from "@/components/invoice-status-badge";
import { formatPrice, formatDate, formatDateOnly } from "@/lib/format";
import type { Invoice } from "@/lib/types";

// The invoice list joins each invoice's order to show the order date alongside
// the due date (the order's placement is the date a customer recognizes).
type InvoiceRow = Invoice & { orders: { order_date: string } | null };

export default async function InvoicesPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const { data: customer } = await supabase
    .from("customers")
    .select("business_name")
    .eq("user_id", user.id)
    .maybeSingle<{ business_name: string }>();

  // RLS limits this to the signed-in customer's own invoices.
  const { data } = await supabase
    .from("invoices")
    .select("*, orders(order_date)")
    .order("issue_date", { ascending: false })
    .order("invoice_number", { ascending: false });
  const invoices = (data ?? []) as InvoiceRow[];

  return (
    <div className="flex flex-1 flex-col">
      <CustomerHeader
        label={customer?.business_name ?? user.email ?? ""}
        isAdminUser={isAdmin(user.email)}
      />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-bold tracking-tight text-stone-900">
          Invoices
        </h1>

        {invoices.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-stone-300 bg-white p-10 text-center text-stone-500">
            No invoices yet. They appear here once an order is placed.
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-stone-100 rounded-2xl border border-stone-200 bg-white">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition hover:bg-stone-50"
                >
                  <div>
                    <p className="font-semibold text-stone-900">
                      {inv.invoice_number}
                    </p>
                    <p className="text-xs text-stone-500">
                      {inv.orders?.order_date
                        ? `Ordered ${formatDate(inv.orders.order_date)} · `
                        : ""}
                      Due {formatDateOnly(inv.due_date)}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <InvoiceStatusBadge status={inv.status} />
                    <span className="w-20 text-right font-semibold text-stone-900">
                      {formatPrice(inv.total_amount)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
